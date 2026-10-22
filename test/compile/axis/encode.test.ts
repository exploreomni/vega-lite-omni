import {expressionFunction, parse, View} from 'vega';
import * as encode from '../../../src/compile/axis/encode.js';
import {compile} from '../../../src/compile/compile.js';
import {parseUnitModelWithScale} from '../../util.js';

describe('compile/axis/encode', () => {
  describe('encode.labels()', () => {
    it('should not rotate label for temporal field by default', () => {
      const model = parseUnitModelWithScale({
        mark: 'point',
        encoding: {
          x: {field: 'a', type: 'temporal', timeUnit: 'month'},
        },
      });
      const labels = encode.labels(model, 'x', {});
      expect(labels?.angle).toBeUndefined();
    });

    it('should do not rotate label for temporal field if labelAngle is specified in axis config', () => {
      const model = parseUnitModelWithScale({
        mark: 'point',
        encoding: {
          x: {field: 'a', type: 'temporal', timeUnit: 'month'},
        },
        config: {axisX: {labelAngle: 90}},
      });
      const labels = encode.labels(model, 'x', {});
      expect(labels?.angle).toBeUndefined();
    });

    it('applies custom format type', () => {
      const model = parseUnitModelWithScale({
        mark: 'point',
        encoding: {
          x: {field: 'a', type: 'quantitative', axis: {format: 'abc', formatType: 'customNumberFormat'}},
        },
        config: {customFormatTypes: true},
      });
      const labels = encode.labels(model, 'x', {});
      expect(labels.text.signal).toBe('customNumberFormat(datum.value, "abc")');
    });

    it('applies custom format type without format', () => {
      const model = parseUnitModelWithScale({
        mark: 'point',
        encoding: {
          x: {field: 'a', type: 'quantitative', axis: {formatType: 'customNumberFormat'}},
        },
        config: {customFormatTypes: true},
      });
      const labels = encode.labels(model, 'x', {});
      expect(labels.text.signal).toBe('customNumberFormat(datum.value)');
    });

    it('applies custom format type from config', () => {
      const model = parseUnitModelWithScale({
        mark: 'point',
        encoding: {
          x: {field: 'a', type: 'quantitative'},
        },
        config: {customFormatTypes: true, numberFormat: 'abc', numberFormatType: 'customNumberFormat'},
      });
      const labels = encode.labels(model, 'x', {});
      expect(labels.text.signal).toBe('customNumberFormat(datum.value, "abc")');
    });

    it('applies custom format type from a normalized stack', () => {
      const model = parseUnitModelWithScale({
        mark: 'point',
        encoding: {
          x: {field: 'a', type: 'quantitative', stack: 'normalize'},
        },
        config: {
          customFormatTypes: true,
          normalizedNumberFormat: 'abc',
          normalizedNumberFormatType: 'customNumberFormat',
        },
      });
      const labels = encode.labels(model, 'x', {});
      expect(labels.text.signal).toBe('customNumberFormat(datum.value, "abc")');
    });

    it('applies custom timeFormatType from config', () => {
      const model = parseUnitModelWithScale({
        mark: 'point',
        encoding: {
          x: {field: 'a', type: 'temporal'},
        },
        config: {customFormatTypes: true, timeFormat: 'abc', timeFormatType: 'customTimeFormat'},
      });
      const labels = encode.labels(model, 'x', {});
      expect(labels.text.signal).toBe('customTimeFormat(datum.value, "abc")');
    });

    it('prefers timeUnit over timeFormatType from config', () => {
      const model = parseUnitModelWithScale({
        mark: 'point',
        encoding: {
          x: {field: 'a', type: 'temporal', timeUnit: 'date'},
        },
        config: {customFormatTypes: true, timeFormat: 'abc', timeFormatType: 'customTimeFormat'},
      });
      const labels = encode.labels(model, 'x', {});
      expect(labels).toEqual({});
    });

    it.each([
      ['axis format type', {formatType: 'customNumberFormat'}, {}],
      ['config number format type', {}, {numberFormatType: 'customNumberFormat'}],
    ])("labels the log ticks Vega's own format labels, with a custom %s", async (_, axis, config) => {
      expressionFunction('customNumberFormat', (value: number) => `#${value}`);
      const labeled = async (axisFormat: object, configFormat: object) => {
        const {spec} = compile({
          data: {values: [{a: 25}, {a: 45000}]},
          mark: 'point',
          encoding: {
            y: {field: 'a', type: 'quantitative', scale: {type: 'log'}, axis: {labelOverlap: false, ...axisFormat}},
          },
          config: {customFormatTypes: true, ...configFormat},
        });
        const view = new View(parse(spec), {renderer: 'none'});
        await view.runAsync();
        const labelMark = (view.scenegraph() as any).root.items[0].items
          .filter((m: any) => m.role === 'axis')
          .flatMap((m: any) => m.items[0].items)
          .find((m: any) => m.role === 'axis-label');
        return labelMark.items.filter((t: any) => t.text).map((t: any) => t.datum.value);
      };

      const own = await labeled({}, {});
      expect(own).toContain(100);
      expect(own).not.toContain(300);
      expect(await labeled(axis, config)).toEqual(own);
    });
  });
});
