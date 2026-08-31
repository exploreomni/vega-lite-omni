import {AggregateOp, LayoutAlign, Legend as VgLegend, NewSignal, SignalRef} from 'vega';
import {isArray, isObject, isString} from 'vega-util';
import {isBinning} from '../bin.js';
import {
  COLUMN,
  ExtendedChannel,
  FacetChannel,
  FACET_CHANNELS,
  POSITION_SCALE_CHANNELS,
  ROW,
  ScaleChannel,
} from '../channel.js';
import {FieldName, FieldRefOption, initFieldDef, TypedFieldDef, vgField} from '../channeldef.js';
import {Config} from '../config.js';
import {ExprRef, replaceExprRef} from '../expr.js';
import {LEGEND_SCALE_CHANNELS} from '../legend.js';
import * as log from '../log/index.js';
import {hasDiscreteDomain} from '../scale.js';
import {DEFAULT_SORT_OP, EncodingSortField, isSortField, SortOrder} from '../sort.js';
import {NormalizedFacetSpec} from '../spec/index.js';
import {EncodingFacetMapping, FacetFieldDef, FacetMapping, isFacetMapping} from '../spec/facet.js';
import {isStep} from '../spec/base.js';
import {hasProperty, keys, vals} from '../util.js';
import {isVgRangeStep, VgData, VgLayout, VgMarkGroup, VgScale} from '../vega.schema.js';
import {buildModel} from './buildmodel.js';
import {assembleFacetData} from './data/assemble.js';
import {sortArrayIndexField} from './data/calculate.js';
import {parseData} from './data/parse.js';
import {assembleLabelTitle} from './header/assemble.js';
import {getHeaderChannel, getHeaderProperty} from './header/common.js';
import {HEADER_CHANNELS, HEADER_TYPES} from './header/component.js';
import {parseFacetHeaders} from './header/parse.js';
import {assembleLayoutSignals} from './layoutsize/assemble.js';
import {parseChildrenLayoutSize} from './layoutsize/parse.js';
import {Model, ModelWithField} from './model.js';
import {defaultScaleResolve} from './resolve.js';
import {assembleDomain, getFieldFromDomain} from './scale/domain.js';
import {assembleFacetSignals} from './selection/assemble.js';
import {isTimerSelection} from './selection/index.js';
import {MULTI_VIEW_ANIMATION_UNSUPPORTED} from '../log/message.js';

export function facetSortFieldName(
  fieldDef: FacetFieldDef<string>,
  sort: EncodingSortField<string>,
  opt?: FieldRefOption,
) {
  return vgField(sort, {suffix: `by_${vgField(fieldDef)}`, ...opt});
}

function legendScaleNames(legend: VgLegend): string[] {
  return LEGEND_SCALE_CHANNELS.map((prop) => legend[prop]).filter((name): name is string => !!name);
}

function referencesCellScope(
  value: unknown,
  cellDataNames: ReadonlySet<string>,
  cellSignalTests: readonly RegExp[],
): boolean {
  if (isArray(value)) {
    return value.some((entry) => referencesCellScope(entry, cellDataNames, cellSignalTests));
  }
  if (isObject(value)) {
    const {data, signal} = value as {data?: unknown; signal?: unknown};
    if (isString(data) && cellDataNames.has(data)) {
      return true;
    }
    if (isString(signal) && cellSignalTests.some((test) => test.test(signal))) {
      return true;
    }
    return vals(value).some((entry) => referencesCellScope(entry, cellDataNames, cellSignalTests));
  }
  return false;
}

/**
 * Map each scale assembled somewhere in this subtree back to the channel it
 * encodes. Merged components are skipped: their scales assemble under the name
 * of the component they merged into, which its owner reports.
 */
function collectScaleChannels(model: Model, index: Map<string, ScaleChannel>) {
  for (const channel of keys(model.component.scales)) {
    const scaleComponent = model.component.scales[channel];
    if (!scaleComponent.merged) {
      index.set(scaleComponent.get('name'), channel);
    }
  }
  for (const child of model.children) {
    collectScaleChannels(child, index);
  }
}

/**
 * Split out of the cell group the legends for channels the facet resolves as
 * shared, together with the scales they reference, so the facet's own group can
 * render them once.
 *
 * A facet child that resolves a non-position channel independently (e.g. a layer
 * with `resolve: {scale: {color: 'independent'}}`) keeps those scales on its
 * units, so they — and their legends — assemble inside the repeated cell group:
 * the legend renders once per facet value, laid out inside the cell between the
 * plot and any hoisted axes. The sibling-level independent resolve says nothing
 * about sharing across cells; that is the facet's own resolve, and when it says
 * 'shared' (the default) the legend belongs on the facet's group. The referenced
 * scales must move with it because a legend cannot reach a scale defined in a
 * sibling scope, while the cell's marks still resolve the moved scale by walking
 * up to the enclosing scope.
 *
 * The hoist additionally requires each scale to be facet-invariant — nothing in
 * it may reference a dataset or signal scoped to the cell. A facet-shared scale
 * assembles that way (explicit domains, or domains reading the shared post-facet
 * datasets), so this is a safety condition rather than a second policy: moving a
 * scale with a cell-scoped reference would leave it dangling, which is strictly
 * worse than the duplicated legend it fixes.
 */
function extractFacetSharedLegends(model: FacetModel, cell: VgMarkGroup): {legends: VgLegend[]; scales: VgScale[]} {
  const cellLegends: VgLegend[] = cell.legends ?? [];
  const cellScales: VgScale[] = cell.scales ?? [];
  if (cellLegends.length === 0 || cellScales.length === 0) {
    return {legends: [], scales: []};
  }

  const scaleByName = new Map<string, VgScale>(cellScales.map((scale) => [scale.name, scale]));
  const scaleChannels = new Map<string, ScaleChannel>();
  collectScaleChannels(model, scaleChannels);
  const cellDataNames = new Set<string>([
    ...(cell.data ?? []).map((dataset: VgData) => dataset.name),
    cell.from.facet.name,
  ]);
  const cellSignalTests = ((cell.signals ?? []) as NewSignal[]).map(({name}) => new RegExp(`\\b${name}\\b`));

  // The facet has no scale component of its own on these channels, so its resolve
  // may never have been defaulted — same fallback as parseUnitScaleDomain.
  const facetResolvesShared = (channel: ScaleChannel) =>
    (model.component.resolve.scale[channel] ?? defaultScaleResolve(channel, model)) === 'shared';

  const isHoistable = (legend: VgLegend) => {
    const scaleNames = legendScaleNames(legend);
    return (
      scaleNames.length > 0 &&
      scaleNames.every((name) => {
        const channel = scaleChannels.get(name);
        const scale = scaleByName.get(name);
        return (
          channel !== undefined &&
          facetResolvesShared(channel) &&
          scale !== undefined &&
          !referencesCellScope(scale, cellDataNames, cellSignalTests)
        );
      })
    );
  };

  const legends = cellLegends.filter(isHoistable);
  if (legends.length === 0) {
    return {legends: [], scales: []};
  }
  const scaleNamesToHoist = new Set(legends.flatMap(legendScaleNames));

  const remainingLegends = cellLegends.filter((legend) => !legends.includes(legend));
  if (remainingLegends.length > 0) {
    cell.legends = remainingLegends;
  } else {
    delete cell.legends;
  }
  const remainingScales = cellScales.filter((scale) => !scaleNamesToHoist.has(scale.name));
  if (remainingScales.length > 0) {
    cell.scales = remainingScales;
  } else {
    delete cell.scales;
  }

  return {legends, scales: cellScales.filter((scale) => scaleNamesToHoist.has(scale.name))};
}

export class FacetModel extends ModelWithField {
  public readonly facet: EncodingFacetMapping<string, SignalRef>;

  public readonly child: Model;

  public readonly children: Model[];

  private hoistedLegends: VgLegend[] = [];

  private hoistedScales: VgScale[] = [];

  constructor(spec: NormalizedFacetSpec, parent: Model, parentGivenName: string, config: Config<SignalRef>) {
    super(spec, 'facet', parent, parentGivenName, config, spec.resolve);

    this.child = buildModel(spec.spec, this, this.getName('child'), undefined, config);
    this.children = [this.child];

    this.size = {
      ...(spec.width ? {width: spec.width} : {}),
      ...(spec.height ? {height: spec.height} : {}),
    };

    this.facet = this.initFacet(spec.facet);
  }

  private initFacet(
    facet: FacetFieldDef<FieldName> | FacetMapping<FieldName>,
  ): EncodingFacetMapping<FieldName, SignalRef> {
    // clone to prevent side effect to the original spec
    if (!isFacetMapping(facet)) {
      return {facet: this.initFacetFieldDef(facet, 'facet')};
    }

    const channels = keys(facet);
    const normalizedFacet: EncodingFacetMapping<FieldName, SignalRef> = {};
    for (const channel of channels) {
      if (![ROW, COLUMN].includes(channel)) {
        // Drop unsupported channel
        log.warn(log.message.incompatibleChannel(channel, 'facet'));
        break;
      }

      const fieldDef = facet[channel];
      if (fieldDef.field === undefined) {
        log.warn(log.message.emptyFieldDef(fieldDef, channel));
        break;
      }

      normalizedFacet[channel] = this.initFacetFieldDef(fieldDef, channel);
    }

    return normalizedFacet;
  }

  private initFacetFieldDef(fieldDef: FacetFieldDef<FieldName, ExprRef | SignalRef>, channel: FacetChannel) {
    // Cast because we call initFieldDef, which assumes general FieldDef.
    // However, FacetFieldDef is a bit more constrained than the general FieldDef
    const facetFieldDef = initFieldDef(fieldDef, channel) as FacetFieldDef<FieldName, SignalRef>;
    if (facetFieldDef.header) {
      facetFieldDef.header = replaceExprRef(facetFieldDef.header);
    } else if (facetFieldDef.header === null) {
      facetFieldDef.header = null;
    }
    return facetFieldDef;
  }

  public channelHasField(channel: ExtendedChannel): boolean {
    return hasProperty(this.facet, channel);
  }

  public fieldDef(channel: ExtendedChannel): TypedFieldDef<string> {
    return (this.facet as any)[channel];
  }

  public parseData() {
    this.component.data = parseData(this);
    this.child.parseData();
  }

  public parseLayoutSize() {
    parseChildrenLayoutSize(this);

    const {size, component} = this;
    for (const dimension of ['width', 'height'] as const) {
      const specifiedSize = size[dimension];
      if (specifiedSize) {
        component.layoutSize.set(dimension, isStep(specifiedSize) ? 'step' : specifiedSize, true);
      }
    }
  }

  public parseSelections() {
    // As a facet has a single child, the selection components are the same.
    // The child maintains its selections to assemble signals, which remain
    // within its unit.
    this.child.parseSelections();
    this.component.selection = this.child.component.selection;

    if (vals(this.component.selection).some((selCmpt) => isTimerSelection(selCmpt))) {
      log.error(MULTI_VIEW_ANIMATION_UNSUPPORTED);
    }
  }

  public parseMarkGroup() {
    this.child.parseMarkGroup();
  }

  public parseAxesAndHeaders() {
    this.child.parseAxesAndHeaders();

    parseFacetHeaders(this);
  }

  public assembleSelectionTopLevelSignals(signals: NewSignal[]): NewSignal[] {
    return this.child.assembleSelectionTopLevelSignals(signals);
  }

  public assembleSignals(): NewSignal[] {
    this.child.assembleSignals();
    return [];
  }

  public assembleSelectionData(data: readonly VgData[]): readonly VgData[] {
    return this.child.assembleSelectionData(data);
  }

  private getHeaderLayoutMixins(): VgLayout {
    const layoutMixins: VgLayout = {};

    for (const channel of FACET_CHANNELS) {
      for (const headerType of HEADER_TYPES) {
        const layoutHeaderComponent = this.component.layoutHeaders[channel];
        const headerComponent = layoutHeaderComponent[headerType];

        const {facetFieldDef} = layoutHeaderComponent;
        if (facetFieldDef) {
          const titleOrient = getHeaderProperty('titleOrient', facetFieldDef.header, this.config, channel);

          if (['right', 'bottom'].includes(titleOrient)) {
            const headerChannel = getHeaderChannel(channel, titleOrient);
            layoutMixins.titleAnchor ??= {};
            (layoutMixins.titleAnchor as any)[headerChannel] = 'end';
          }
        }

        if (headerComponent?.[0]) {
          // set header/footerBand
          const sizeType = channel === 'row' ? 'height' : 'width';
          const bandType = headerType === 'header' ? 'headerBand' : 'footerBand';
          if (channel !== 'facet' && !this.child.component.layoutSize.get(sizeType)) {
            // If facet child does not have size signal, then apply headerBand
            layoutMixins[bandType] ??= {};
            (layoutMixins[bandType] as any)[channel] = 0.5;
          }

          if (layoutHeaderComponent.title) {
            layoutMixins.offset ??= {};
            (layoutMixins.offset as any)[channel === 'row' ? 'rowTitle' : 'columnTitle'] = 10;
          }
        }
      }
    }
    return layoutMixins;
  }

  protected assembleDefaultLayout(): VgLayout {
    const {column, row} = this.facet;

    const columns = column ? this.columnDistinctSignal() : row ? 1 : undefined;

    let align: LayoutAlign = 'all';

    // Do not align the cells if the scale corresponding to the direction is indepent.
    // We always align when we facet into both row and column.
    if (!row && this.component.resolve.scale.x === 'independent') {
      align = 'none';
    } else if (!column && this.component.resolve.scale.y === 'independent') {
      align = 'none';
    }

    return {
      ...this.getHeaderLayoutMixins(),

      ...(columns ? {columns} : {}),
      bounds: 'full',
      align,
    };
  }

  public assembleLayoutSignals(): NewSignal[] {
    const layoutSignals = assembleLayoutSignals(this);

    for (const signal of this.child.assembleLayoutSignals()) {
      const currentSignals = layoutSignals.map((s) => s.name);
      if (!currentSignals.includes(signal.name)) {
        layoutSignals.push(signal);
      }
    }

    return layoutSignals;
  }

  private columnDistinctSignal() {
    if (this.parent && this.parent instanceof FacetModel) {
      // For nested facet, we will add columns to group mark instead
      // See discussion in https://github.com/vega/vega/issues/952
      // and https://github.com/vega/vega-view/releases/tag/v1.2.6
      return undefined;
    } else {
      // In facetNode.assemble(), the name is always this.getName('column') + '_layout'.
      const facetLayoutDataName = this.getName('column_domain');
      return {signal: `length(data('${facetLayoutDataName}'))`};
    }
  }

  public assembleGroupStyle(): string | string[] {
    return undefined;
  }

  public assembleGroup(signals: NewSignal[]) {
    // super.assembleGroup assembles the marks — populating hoistedLegends/hoistedScales
    // via assembleMarks — before it assembles this group's own scales and legends.
    const group =
      this.parent && this.parent instanceof FacetModel
        ? {
            // Provide number of columns for layout.
            // See discussion in https://github.com/vega/vega/issues/952
            // and https://github.com/vega/vega-view/releases/tag/v1.2.6
            ...(this.channelHasField('column')
              ? {
                  encode: {
                    update: {
                      // TODO(https://github.com/vega/vega-lite/issues/2759):
                      // Correct the signal for facet of concat of facet_column
                      columns: {field: vgField(this.facet.column, {prefix: 'distinct'})},
                    },
                  },
                }
              : {}),
            ...super.assembleGroup(signals),
          }
        : super.assembleGroup(signals);

    if (this.hoistedScales.length > 0) {
      group.scales = [...(group.scales ?? []), ...this.hoistedScales];
    }
    if (this.hoistedLegends.length > 0) {
      group.legends = [...(group.legends ?? []), ...this.hoistedLegends];
    }
    return group;
  }

  /**
   * Aggregate cardinality for calculating size
   */
  private getCardinalityAggregateForChild() {
    const fields: string[] = [];
    const ops: AggregateOp[] = [];
    const as: string[] = [];

    if (this.child instanceof FacetModel) {
      if (this.child.channelHasField('column')) {
        const field = vgField(this.child.facet.column);
        fields.push(field);
        ops.push('distinct');
        as.push(`distinct_${field}`);
      }
    } else {
      for (const channel of POSITION_SCALE_CHANNELS) {
        const childScaleComponent = this.child.component.scales[channel];
        if (childScaleComponent && !childScaleComponent.merged) {
          const type = childScaleComponent.get('type');
          const range = childScaleComponent.get('range');

          if (hasDiscreteDomain(type) && isVgRangeStep(range)) {
            const domain = assembleDomain(this.child, channel);
            const field = getFieldFromDomain(domain);
            if (field) {
              fields.push(field);
              ops.push('distinct');
              as.push(`distinct_${field}`);
            } else {
              log.warn(log.message.unknownField(channel));
            }
          }
        }
      }
    }
    return {fields, ops, as};
  }

  private assembleFacet() {
    const {name, data} = this.component.data.facetRoot;
    const {row, column} = this.facet;
    const {fields, ops, as} = this.getCardinalityAggregateForChild();
    const groupby: string[] = [];

    for (const channel of FACET_CHANNELS) {
      const fieldDef = this.facet[channel];
      if (fieldDef) {
        groupby.push(vgField(fieldDef));

        const {bin, sort} = fieldDef;

        if (isBinning(bin)) {
          groupby.push(vgField(fieldDef, {binSuffix: 'end'}));
        }

        // `fields` is a field reference, so a dot in the name stays escaped; `as` is
        // the literal output name, so it must not be. They differ for dotted fields.
        if (isSortField(sort)) {
          const {field, op = DEFAULT_SORT_OP} = sort;
          const outputName = facetSortFieldName(fieldDef, sort, {forAs: true});
          if (row && column) {
            // For crossed facet, use pre-calculate field as it requires a different groupby
            // For each calculated field, apply max and assign them to the same name as
            // all values of the same group should be the same anyway.
            fields.push(facetSortFieldName(fieldDef, sort));
            ops.push('max');
            as.push(outputName);
          } else {
            fields.push(field);
            ops.push(op);
            as.push(outputName);
          }
        } else if (isArray(sort)) {
          fields.push(sortArrayIndexField(fieldDef, channel));
          ops.push('max');
          as.push(sortArrayIndexField(fieldDef, channel, {forAs: true}));
        }
      }
    }

    const cross = !!row && !!column;

    return {
      name,
      data,
      groupby,
      ...(cross || fields.length > 0
        ? {
            aggregate: {
              ...(cross ? {cross} : {}),
              ...(fields.length ? {fields, ops, as} : {}),
            },
          }
        : {}),
    };
  }

  private facetSortFields(channel: FacetChannel): string[] {
    const {facet} = this;
    const fieldDef = facet[channel];

    if (fieldDef) {
      if (isSortField(fieldDef.sort)) {
        return [facetSortFieldName(fieldDef, fieldDef.sort, {expr: 'datum'})];
      } else if (isArray(fieldDef.sort)) {
        return [sortArrayIndexField(fieldDef, channel, {expr: 'datum'})];
      }
      return [vgField(fieldDef, {expr: 'datum'})];
    }
    return [];
  }

  private facetSortOrder(channel: FacetChannel): SortOrder[] {
    const {facet} = this;
    const fieldDef = facet[channel];
    if (fieldDef) {
      const {sort} = fieldDef;
      const order = (isSortField(sort) ? sort.order : !isArray(sort) && sort) || 'ascending';
      return [order];
    }
    return [];
  }

  private assembleLabelTitle() {
    const {facet, config} = this;
    if (facet.facet) {
      // Facet always uses title to display labels
      return assembleLabelTitle(facet.facet, 'facet', config);
    }

    const ORTHOGONAL_ORIENT = {
      row: ['top', 'bottom'],
      column: ['left', 'right'],
    };

    for (const channel of HEADER_CHANNELS) {
      if (facet[channel]) {
        const labelOrient = getHeaderProperty('labelOrient', facet[channel]?.header, config, channel);
        if (ORTHOGONAL_ORIENT[channel].includes(labelOrient)) {
          // Row/Column with orthogonal labelOrient must use title to display labels
          return assembleLabelTitle(facet[channel], channel, config);
        }
      }
    }
    return undefined;
  }

  public assembleMarks(): VgMarkGroup[] {
    const {child} = this;

    // If we facet by two dimensions, we need to add a cross operator to the aggregation
    // so that we create all groups
    const facetRoot = this.component.data.facetRoot;
    const data = assembleFacetData(facetRoot);

    const encodeEntry = child.assembleGroupEncodeEntry(false);

    const title = this.assembleLabelTitle() || child.assembleTitle();
    const style = child.assembleGroupStyle();

    const markGroup = {
      name: this.getName('cell'),
      type: 'group',
      ...(title ? {title} : {}),
      ...(style ? {style} : {}),
      from: {
        facet: this.assembleFacet(),
      },
      // TODO: move this to after data
      sort: {
        field: FACET_CHANNELS.map((c) => this.facetSortFields(c)).flat(),
        order: FACET_CHANNELS.map((c) => this.facetSortOrder(c)).flat(),
      },
      ...(data.length > 0 ? {data} : {}),
      ...(encodeEntry ? {encode: {update: encodeEntry}} : {}),
      ...child.assembleGroup(assembleFacetSignals(this, [])),
    };

    const {legends, scales} = extractFacetSharedLegends(this, markGroup);
    this.hoistedLegends = legends;
    this.hoistedScales = scales;

    return [markGroup];
  }

  protected getMapping() {
    return this.facet;
  }
}
