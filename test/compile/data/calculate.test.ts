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
        expr: 'indexof(["B","A","C"], datum["a"]) === -1 ? 3 : indexof(["B","A","C"], datum["a"])',
        as: 'x_a_sort_index',
      });
    });

    it('produces a formula vega can run for a sort array with thousands of values', async () => {
      const sort = Array.from({length: 5000}, (_, i) => `v${i}`);
      const model = parseUnitModel({
        mark: 'bar',
        encoding: {
          x: {field: 'a', type: 'nominal', sort},
          y: {field: 'b', type: 'quantitative'},
        },
      });
      const formula = assembleFromSortArray(model);
      const view = new View(
        parse({data: [{name: 'table', values: [{a: 'v4999'}, {a: 'missing'}], transform: [formula]}]}),
      );
      await view.runAsync();

      expect(view.data('table').map((d) => d.x_a_sort_index)).toEqual([4999, 5000]);
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
        'Calculate {"as":"x_a_sort_index","calculate":"indexof([\\"B\\",\\"A\\",\\"C\\"], datum[\\"a\\"]) === -1 ? 3 : indexof([\\"B\\",\\"A\\",\\"C\\"], datum[\\"a\\"])"}',
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
