import {AxisOrient, SignalRef} from 'vega';
import {isArray} from 'vega-util';
import {FacetChannel, FACET_CHANNELS} from '../../channel.js';
import {title as fieldDefTitle} from '../../channeldef.js';
import {contains, getFirstDefined} from '../../util.js';
import {isSignalRef} from '../../vega.schema.js';
import {assembleAxis} from '../axis/assemble.js';
import {FacetModel} from '../facet.js';
import {isUnitModel, Model} from '../model.js';
import {parseGuideResolve} from '../resolve.js';
import {getHeaderProperty} from './common.js';
import {HeaderChannel, HeaderComponent} from './component.js';

export function getHeaderType(orient: AxisOrient | SignalRef) {
  if (orient === 'top' || orient === 'left' || isSignalRef(orient)) {
    // we always use header for orient signal since we can't dynamically make header becomes footer
    return 'header';
  }
  return 'footer';
}

export function parseFacetHeaders(model: FacetModel) {
  for (const channel of FACET_CHANNELS) {
    parseFacetHeader(model, channel);
  }

  mergeChildAxis(model, 'x');
  mergeChildAxis(model, 'y');
}

function parseFacetHeader(model: FacetModel, channel: FacetChannel) {
  const {facet, config, child, component} = model;
  if (model.channelHasField(channel)) {
    const fieldDef = facet[channel];
    const titleConfig = getHeaderProperty('title', null, config, channel);
    let title = fieldDefTitle(fieldDef, config, {
      allowDisabling: true,
      includeDefault: titleConfig === undefined || !!titleConfig,
    });

    if (child.component.layoutHeaders[channel].title) {
      // TODO: better handle multiline titles
      title = isArray(title) ? title.join(', ') : title;

      // merge title with child to produce "Title / Subtitle / Sub-subtitle"
      title += ` / ${child.component.layoutHeaders[channel].title}`;
      child.component.layoutHeaders[channel].title = null;
    }

    const labelOrient = getHeaderProperty('labelOrient', fieldDef.header, config, channel);

    const labels =
      fieldDef.header !== null ? getFirstDefined(fieldDef.header?.labels, config.header.labels, true) : false;
    const headerType = contains(['bottom', 'right'], labelOrient) ? 'footer' : 'header';

    component.layoutHeaders[channel] = {
      title: fieldDef.header !== null ? title : null,
      facetFieldDef: fieldDef,
      [headerType]: channel === 'facet' ? [] : [makeHeaderComponent(model, channel, labels)],
    };
  }
}

function makeHeaderComponent(model: FacetModel, channel: HeaderChannel, labels: boolean): HeaderComponent {
  const sizeType = channel === 'row' ? 'height' : 'width';

  return {
    labels,
    sizeSignal: model.child.component.layoutSize.get(sizeType) ? model.child.getSizeSignalRef(sizeType) : undefined,
    axes: [],
  };
}

/**
 * Whether a facet's child scopes this channel's scales below itself rather than exposing
 * a single merged scale. When a non-unit model resolves the channel as `independent`,
 * `parseNonUnitScaleCore` leaves no merged scale component on it and each of its children
 * keeps its own scale — which is assembled inside the facet's cell group.
 *
 * The independent resolve can sit at any depth (e.g. a layer whose own child layer
 * declares it), so walk the subtree rather than checking the direct child only.
 */
function childHasIndependentScale(child: Model, channel: 'x' | 'y'): boolean {
  if (isUnitModel(child)) {
    return false;
  }
  if (child.component.resolve.scale[channel] === 'independent') {
    return true;
  }
  return child.children.some((grandchild) => childHasIndependentScale(grandchild, channel));
}

function mergeChildAxis(model: FacetModel, channel: 'x' | 'y') {
  const {child} = model;
  if (child.component.axes[channel]) {
    const {layoutHeaders, resolve} = model.component;
    resolve.axis[channel] = parseGuideResolve(resolve, channel);

    // A facet child that resolves this channel's scale independently (e.g. a layer
    // with `resolve: {scale: {y: 'independent'}}`) assembles those scales *inside*
    // the cell group. Hoisting its axes into the facet's row/column header would
    // reference a scale that does not exist in that scope, so keep them in the cell.
    if (childHasIndependentScale(child, channel)) {
      resolve.axis[channel] = 'independent';
    }

    if (resolve.axis[channel] === 'shared') {
      // For shared axis, move the axes to facet's header or footer
      const headerChannel = channel === 'x' ? 'column' : 'row';

      const layoutHeader = layoutHeaders[headerChannel];
      for (const axisComponent of child.component.axes[channel]) {
        const headerType = getHeaderType(axisComponent.get('orient'));
        layoutHeader[headerType] ??= [makeHeaderComponent(model, headerChannel, false)];

        // FIXME: assemble shouldn't be called here, but we do it this way so we only extract the main part of the axes
        const mainAxis = assembleAxis(axisComponent, 'main', model.config, {header: true});
        if (mainAxis) {
          // LayoutHeader no longer keep track of property precedence, thus let's combine.
          layoutHeader[headerType][0].axes.push(mainAxis);
        }
        axisComponent.mainExtracted = true;
      }
    } else {
      // Otherwise do nothing for independent axes
    }
  }
}
