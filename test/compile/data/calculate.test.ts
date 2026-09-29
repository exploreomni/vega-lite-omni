import {parse, View} from 'vega';
import {CalculateNode} from '../../../src/compile/data/calculate.js';
import {ModelWithField} from '../../../src/compile/model.js';
import {parseUnitModel} from '../../util.js';
import {PlaceholderDataFlowNode} from './util.js';

function assembleFromSortArray(model: ModelWithField) {
  const node = CalculateNode.parseAllForSortIndex(null, model) as CalculateNode;
  return node.assemble();
}

describe('compile/data/calculate', () => {
  describe('makeAllForSortIndex', () => {
    it('produces correct formula transform', () => {
      const model = parseUnitModel({
        data: {
          values: [
            {a: 'A', b: 28},
            {a: 'B', b: 55},
            {a: 'C', b: 43},
          ],
        },
        mark: 'bar',
        encoding: {
          x: {field: 'a', type: 'ordinal', sort: ['B', 'A', 'C']},
          y: {field: 'b', type: 'quantitative'},
        },
      });
      const nodes = assembleFromSortArray(model);
      expect(nodes).toEqual({
        type: 'formula',
        expr: '(indexof(["B","A","C"], datum["a"]) + 1 || 4) - 1',
        as: 'x_a_sort_index',
      });
    });

    it.each([
      {
        name: 'thousands of values',
        x: {field: 'a', type: 'nominal', sort: Array.from({length: 5000}, (_, i) => `v${i}`)},
        values: [{a: 'v4999'}, {a: 'missing'}],
        as: 'x_a_sort_index',
        expected: [4999, 5000],
      },
      {
        name: 'DateTime values on a timeUnit field',
        x: {field: 'a', type: 'ordinal', timeUnit: 'month', sort: [{month: 'mar'}, {month: 'jan'}]},
        values: [{a: new Date(2020, 0, 15)}, {a: new Date(2021, 2, 15)}, {a: new Date(2020, 1, 15)}],
        as: 'x_month_a_sort_index',
        expected: [1, 0, 2],
      },
    ] as const)('produces a formula vega runs for a sort array with $name', async ({x, values, as, expected}) => {
      const model = parseUnitModel({
        mark: 'bar',
        encoding: {x, y: {field: 'b', type: 'quantitative'}},
      });
      const formula = assembleFromSortArray(model);
      const view = new View(parse({data: [{name: 'table', values, transform: [formula]}]}));
      await view.runAsync();

      expect(view.data('table').map((d) => d[as])).toEqual(expected);
    });
  });

  describe('dependentFields and producedFields', () => {
    it('returns the right fields', () => {
      const node = new CalculateNode(null, {
        calculate: 'datum.foo + 2',
        as: 'bar',
      });

      expect(node.dependentFields()).toEqual(new Set(['foo']));
      expect(node.producedFields()).toEqual(new Set(['bar']));
    });
  });

  describe('hash', () => {
    it('should generate the correct hash', () => {
      const model = parseUnitModel({
        data: {
          values: [
            {a: 'A', b: 28},
            {a: 'B', b: 55},
            {a: 'C', b: 43},
          ],
        },
        mark: 'bar',
        encoding: {
          x: {field: 'a', type: 'ordinal', sort: ['B', 'A', 'C']},
          y: {field: 'b', type: 'quantitative'},
        },
      });
      const node = CalculateNode.parseAllForSortIndex(null, model) as CalculateNode;
      expect(node.hash()).toBe(
        'Calculate {"as":"x_a_sort_index","calculate":"(indexof([\\"B\\",\\"A\\",\\"C\\"], datum[\\"a\\"]) + 1 || 4) - 1"}',
      );
    });
  });

  describe('clone', () => {
    it('should never clone parent', () => {
      const parent = new PlaceholderDataFlowNode(null);
      const calculate = new CalculateNode(parent, {calculate: 'foo', as: 'bar'});
      expect(calculate.clone().parent).toBeNull();
    });
  });
});
