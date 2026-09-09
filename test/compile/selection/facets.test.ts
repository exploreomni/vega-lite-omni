import {FacetModel} from '../../../src/compile/facet.js';
import {unitName} from '../../../src/compile/selection/index.js';
import {
  assembleFacetSignals,
  assembleTopLevelSignals,
  assembleUnitSelectionSignals,
} from '../../../src/compile/selection/assemble.js';
import {UnitModel} from '../../../src/compile/unit.js';
import {compile} from '../../../src/compile/compile.js';
import {TopLevelSpec} from '../../../src/spec/index.js';
import {parseModel} from '../../util.js';

describe('Faceted Selections', () => {
  const model = parseModel({
    data: {url: 'data/anscombe.json'},
    facet: {
      column: {field: 'Series', type: 'nominal'},
      row: {field: 'X', type: 'nominal', bin: true},
    },
    spec: {
      layer: [
        {
          mark: 'rule',
          encoding: {y: {value: 10}},
        },
        {
          params: [
            {name: 'one', select: 'point'},
            {name: 'two', select: 'interval'},
          ],
          mark: 'rule',
          encoding: {
            x: {field: 'a'},
            y: {field: 'b'},
          },
        },
      ],
    },
  });

  model.parse();
  const unit = model.children[0].children[1] as UnitModel;

  it('should assemble a facet signal', () => {
    expect(assembleFacetSignals(model as FacetModel, [])).toContainEqual({
      name: 'facet',
      value: {},
      on: [
        {
          events: [{source: 'scope', type: 'pointermove'}],
          update: 'isTuple(facet) ? facet : group("cell").datum',
        },
      ],
    });
  });

  it('should name the unit with the facet keys', () => {
    expect(unitName(unit)).toBe(
      `"child_layer_1" + '__facet_row_' + (facet["bin_maxbins_6_X"]) + '__facet_column_' + (facet["Series"])`,
    );
  });
});

describe('Legend-bound selections in facets', () => {
  const spec: TopLevelSpec = {
    data: {url: 'data/cars.json'},
    facet: {column: {field: 'Cylinders', type: 'nominal'}},
    spec: {
      layer: [
        {
          params: [{name: 'sel', select: {type: 'point', fields: ['Origin']}, bind: 'legend'}],
          mark: 'point',
          encoding: {
            x: {field: 'Horsepower', type: 'quantitative'},
            y: {field: 'Miles_per_Gallon', type: 'quantitative'},
            color: {field: 'Origin', type: 'nominal'},
          },
        },
      ],
    },
  };
  const selectionSignals = ['sel_tuple_fields', 'sel_tuple', 'sel_toggle', 'sel_modify'];

  const model = parseModel(spec);
  model.parse();
  const unit = model.children[0].children[0] as UnitModel;

  it('assembles the selection at the top level, not in the cell', () => {
    const unitNames = assembleUnitSelectionSignals(unit, []).map((s) => s.name);
    expect(unitNames).not.toEqual(expect.arrayContaining(selectionSignals));

    const topLevel = assembleTopLevelSignals(unit, []);
    expect(topLevel.map((s) => s.name)).toEqual(expect.arrayContaining(selectionSignals));
    expect(topLevel).toContainEqual({
      name: 'sel_tuple',
      update: 'sel_Origin_legend !== null ? {fields: sel_tuple_fields, values: [sel_Origin_legend]} : null',
    });
    expect(topLevel).toContainEqual({
      name: 'sel_modify',
      on: [
        {
          events: {signal: 'sel_tuple'},
          update:
            'modify("sel_store", sel_toggle ? null : sel_tuple, sel_toggle ? null : true, sel_toggle ? sel_tuple : null)',
        },
      ],
    });
  });

  it('emits one modify signal, outside the cell group', () => {
    const vgSpec = compile(spec).spec;
    const topLevelNames = vgSpec.signals.map((s) => s.name);
    expect(topLevelNames).toEqual(expect.arrayContaining(selectionSignals));
    expect(topLevelNames.filter((n) => n === 'sel_modify')).toHaveLength(1);

    const cell = vgSpec.marks.find((m) => m.name === 'cell') as any;
    expect(cell.signals?.map((s: {name: string}) => s.name) ?? []).not.toEqual(
      expect.arrayContaining(selectionSignals),
    );
  });

  it('keeps a selection with direct-manipulation events in the cell', () => {
    const withEvents = parseModel({
      ...spec,
      spec: {
        layer: [
          {
            params: [{name: 'sel', select: {type: 'point', fields: ['Origin'], on: 'click'}, bind: 'legend'}],
            mark: 'point',
            encoding: {
              x: {field: 'Horsepower', type: 'quantitative'},
              y: {field: 'Miles_per_Gallon', type: 'quantitative'},
              color: {field: 'Origin', type: 'nominal'},
            },
          },
        ],
      },
    });
    withEvents.parse();
    const unitWithEvents = withEvents.children[0].children[0] as UnitModel;
    expect(assembleUnitSelectionSignals(unitWithEvents, []).map((s) => s.name)).toEqual(
      expect.arrayContaining(selectionSignals),
    );
  });
});
