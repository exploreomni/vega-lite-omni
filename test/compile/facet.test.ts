import type {SignalRef} from 'vega';
import {ROW} from '../../src/channel.js';
import {compile} from '../../src/compile/compile.js';
import {FacetModel} from '../../src/compile/facet.js';
import {FACET_SCALE_PREFIX} from '../../src/compile/data/optimize.js';
import {assembleLabelTitle} from '../../src/compile/header/assemble.js';
import * as log from '../../src/log/index.js';
import {DEFAULT_SPACING} from '../../src/spec/base.js';
import {FacetFieldDef, FacetMapping} from '../../src/spec/facet.js';
import {ORDINAL} from '../../src/type.js';
import {parseFacetModel, parseFacetModelWithScale} from '../util.js';

describe('FacetModel', () => {
  describe('initFacet', () => {
    it(
      'should drop channel without field and value and throws warning',
      log.wrap((localLogger) => {
        const model = parseFacetModel({
          facet: {
            row: {type: 'ordinal'},
          },
          spec: {
            mark: 'point',
            encoding: {},
          },
        });
        expect(model.facet).not.toHaveProperty('row');
        expect(localLogger.warns[0]).toEqual(log.message.emptyFieldDef({type: ORDINAL}, ROW));
      }),
    );

    it(
      'should throw warning about quantitative field used for faceting',
      log.wrap((localLogger) => {
        const model = parseFacetModel({
          facet: {
            row: {field: 'a', type: 'quantitative'},
          },
          spec: {
            mark: 'point',
            encoding: {},
          },
        });
        expect(model.facet).toEqual({row: {field: 'a', type: 'quantitative'}});
        expect(localLogger.warns[0]).toEqual(log.message.channelShouldBeDiscrete(ROW));
      }),
    );

    it('converts orient to titleOrient and labelOrient', () => {
      const model = parseFacetModel({
        facet: {
          row: {field: 'a', type: 'nominal', header: {orient: 'right'}},
        },
        spec: {
          mark: 'point',
          encoding: {},
        },
      });
      expect(model.facet).toEqual({
        row: {field: 'a', type: 'nominal', header: {titleOrient: 'right', labelOrient: 'right'}},
      });
    });

    it('keeps header: null', () => {
      const model = parseFacetModel({
        facet: {
          row: {field: 'a', type: 'nominal', header: null},
        },
        spec: {
          mark: 'point',
          encoding: {},
        },
      });
      expect(model.facet).toEqual({
        row: {field: 'a', type: 'nominal', header: null},
      });
    });
  });

  describe('parseAxisAndHeader', () => {
    // TODO: add more tests
    // - correctly join title for nested facet
    // - correctly generate headers with right labels and axes

    it('applies text format to the fieldref of a temporal field', () => {
      const model = parseFacetModelWithScale({
        facet: {
          column: {timeUnit: 'year', field: 'date', type: 'ordinal'},
        },
        spec: {
          mark: 'point',
          encoding: {
            x: {field: 'b', type: 'quantitative'},
            y: {field: 'c', type: 'quantitative'},
          },
        },
      });
      model.parseAxesAndHeaders();
      const headerMarks = model.assembleHeaderMarks();
      const columnHeader = headerMarks.filter((d) => {
        return d.name === 'column_header';
      })[0];

      expect(columnHeader.title.text.signal).toBeTruthy();
    });

    it('applies number format for fieldref of a quantitative field', () => {
      const model = parseFacetModelWithScale({
        facet: {
          column: {field: 'a', type: 'nominal', header: {format: 'd'}},
        },
        spec: {
          mark: 'point',
          encoding: {
            x: {field: 'b', type: 'quantitative'},
            y: {field: 'c', type: 'quantitative'},
          },
        },
      });
      model.parseAxesAndHeaders();
      const headerMarks = model.assembleHeaderMarks();
      const columnHeader = headerMarks.filter((d) => {
        return d.name === 'column_header';
      })[0];

      expect(columnHeader.title.text.signal).toBeTruthy();
    });

    it('ignores number format for fieldref of a binned field', () => {
      const model = parseFacetModelWithScale({
        facet: {
          column: {bin: true, field: 'a', type: 'quantitative'},
        },
        spec: {
          mark: 'point',
          encoding: {
            x: {field: 'b', type: 'quantitative'},
            y: {field: 'c', type: 'quantitative'},
          },
        },
      });
      model.parseAxesAndHeaders();
      const headerMarks = model.assembleHeaderMarks();
      const columnHeader = headerMarks.filter((d) => {
        return d.name === 'column_header';
      })[0];

      expect(columnHeader.title.text.signal).toBeTruthy();
    });
  });

  describe('parseScale', () => {
    it('should correctly set scale component for a model', () => {
      const model = parseFacetModelWithScale({
        facet: {
          row: {field: 'a', type: 'ordinal'},
        },
        spec: {
          mark: 'point',
          encoding: {
            x: {field: 'b', type: 'quantitative'},
          },
        },
      });

      expect(model.component.scales['x']).toBeTruthy();
    });

    it('should create independent scales if resolve is set to independent', () => {
      const model = parseFacetModelWithScale({
        facet: {
          row: {field: 'a', type: 'ordinal'},
        },
        spec: {
          mark: 'point',
          encoding: {
            x: {field: 'b', type: 'quantitative'},
          },
        },
        resolve: {
          scale: {
            x: 'independent',
          },
        },
      });

      expect(!model.component.scales['x']).toBeTruthy();
    });
  });

  describe('assembleHeaderMarks', () => {
    it('should sort headers in ascending order', () => {
      const model = parseFacetModelWithScale({
        facet: {
          column: {field: 'a', type: 'ordinal'},
        },
        spec: {
          mark: 'point',
          encoding: {
            x: {field: 'b', type: 'quantitative'},
            y: {field: 'c', type: 'quantitative'},
          },
        },
      });
      model.parseAxesAndHeaders();

      const headerMarks = model.assembleHeaderMarks();
      const columnHeader = headerMarks.filter((d) => {
        return d.name === 'column_header';
      })[0];

      expect(columnHeader.sort).toEqual({field: 'datum["a"]', order: 'ascending'});
    });

    it('should not hoist axes into headers when the child layer resolves the scale independently', () => {
      // The child layer's y scales are assembled inside the cell group, so hoisting
      // their axes into a row header/footer would reference an out-of-scope scale.
      const model = parseFacetModelWithScale({
        facet: {
          column: {field: 'f', type: 'nominal'},
        },
        spec: {
          layer: [
            {mark: 'bar', encoding: {x: {field: 'a', type: 'nominal'}, y: {field: 'b', type: 'quantitative'}}},
            {mark: 'line', encoding: {x: {field: 'a', type: 'nominal'}, y: {field: 'c', type: 'quantitative'}}},
          ],
          resolve: {scale: {y: 'independent'}},
        },
      });
      model.parseAxesAndHeaders();

      expect(model.component.resolve.axis.y).toBe('independent');

      const headerMarks = model.assembleHeaderMarks();
      const rowGuides = headerMarks.filter((d) => d.name === 'row_header' || d.name === 'row_footer');
      expect(rowGuides.flatMap((d) => (d as any).axes ?? [])).toEqual([]);

      // The shared x axis is still hoisted to the column footer.
      const columnFooter = headerMarks.filter((d) => d.name === 'column_footer')[0];
      expect((columnFooter as any).axes.map((a: any) => a.scale)).toEqual(['x']);
    });

    it('should not hoist axes when a nested descendant resolves the scale independently', () => {
      // The independent resolve can sit below the facet's direct child.
      const model = parseFacetModelWithScale({
        facet: {
          column: {field: 'f', type: 'nominal'},
        },
        spec: {
          layer: [
            {mark: 'bar', encoding: {x: {field: 'a', type: 'nominal'}, y: {field: 'b', type: 'quantitative'}}},
            {
              layer: [
                {mark: 'line', encoding: {x: {field: 'a', type: 'nominal'}, y: {field: 'c', type: 'quantitative'}}},
                {mark: 'point', encoding: {x: {field: 'a', type: 'nominal'}, y: {field: 'd', type: 'quantitative'}}},
              ],
              resolve: {scale: {y: 'independent'}},
            },
          ],
        },
      });
      model.parseAxesAndHeaders();

      expect(model.component.resolve.axis.y).toBe('independent');

      const headerMarks = model.assembleHeaderMarks();
      const rowGuides = headerMarks.filter((d) => d.name === 'row_header' || d.name === 'row_footer');
      expect(rowGuides.flatMap((d) => (d as any).axes ?? [])).toEqual([]);
    });

    it('should share a child layer’s independent scales across cells by default', () => {
      // `parseNonUnitScaleCore` only defaults resolve.scale[channel] for channels that
      // reach the facet as a merged child scale. y resolves independently below, so the
      // facet has no y scale and the default was never assigned — leaving the domains
      // scoped per cell even though the facet resolves y as 'shared'.
      const model = parseFacetModelWithScale({
        facet: {column: {field: 'f', type: 'nominal'}},
        spec: {
          layer: [
            {mark: 'line', encoding: {x: {field: 'a', type: 'nominal'}, y: {field: 'b', type: 'quantitative'}}},
            {mark: 'line', encoding: {x: {field: 'a', type: 'nominal'}, y: {field: 'c', type: 'quantitative'}}},
          ],
          resolve: {scale: {y: 'independent'}},
        },
      });

      // Every y domain reads the cloned post-facet subtree, so all cells agree.
      for (const child of model.child.children) {
        for (const domain of child.component.scales.y.get('domains')) {
          expect((domain as any).data).toContain(FACET_SCALE_PREFIX);
        }
      }
    });

    it('should not let facet-scoped datasets shadow the top-level ones they reference', () => {
      // Cell datasets are named by a separate walk whose counter restarts at 0, so
      // plain `data_N` names collided with the top-level ones. Vega resolves in the
      // innermost scope, so a cell dataset silently shadowed the top-level dataset a
      // shared domain pointed at — one axis kept rescaling per cell.
      const measureLayer = (field: string, name: string) => ({
        layer: ['line', 'point'].map((mark) => ({
          mark,
          transform: [{calculate: `"${name}"`, as: 'm'}, {filter: `datum.${field} > 0`}],
          encoding: {x: {field: 'a', type: 'nominal'}, y: {field, type: 'quantitative'}},
        })),
      });

      const vgSpec = compile({
        data: {values: [{a: 'A', b: 1, c: 2, f: 'x'}]},
        facet: {column: {field: 'f', type: 'nominal'}},
        spec: {
          layer: [measureLayer('b', 'm1'), measureLayer('c', 'm2')],
          resolve: {scale: {y: 'independent'}},
        },
      } as any).spec;

      const topLevelNames = (vgSpec.data ?? []).map((d) => d.name);
      const cell = (vgSpec.marks ?? []).find((m) => m.name === 'cell') as any;
      const cellNames = (cell.data ?? []).map((d: any) => d.name);

      expect(cellNames.length).toBeGreaterThan(0);
      expect(cellNames.filter((n: string) => topLevelNames.includes(n))).toEqual([]);
    });

    it('should keep a child layer’s independent scales per cell when the facet resolves y independently', () => {
      const model = parseFacetModelWithScale({
        facet: {column: {field: 'f', type: 'nominal'}},
        spec: {
          layer: [
            {mark: 'line', encoding: {x: {field: 'a', type: 'nominal'}, y: {field: 'b', type: 'quantitative'}}},
            {mark: 'line', encoding: {x: {field: 'a', type: 'nominal'}, y: {field: 'c', type: 'quantitative'}}},
          ],
          resolve: {scale: {y: 'independent'}},
        },
        resolve: {scale: {y: 'independent'}},
      });

      for (const child of model.child.children) {
        for (const domain of child.component.scales.y.get('domains')) {
          expect((domain as any).data).not.toContain(FACET_SCALE_PREFIX);
        }
      }
    });
  });

  describe('assembleGroup', () => {
    it('includes a columns fields in the encode block for facet with column that parent is also a facet.', () => {
      const model = parseFacetModelWithScale({
        facet: {
          column: {field: 'a', type: 'ordinal'},
        },
        spec: {
          facet: {
            column: {field: 'c', type: 'ordinal'},
          },
          spec: {
            mark: 'point',
            encoding: {
              x: {field: 'b', type: 'quantitative'},
            },
          },
        },
        // TODO: remove "any" once we support all facet listed in https://github.com/vega/vega-lite/issues/2760
      } as any);
      model.parseData();
      const group = model.child.assembleGroup([]);
      expect(group.encode.update.columns).toEqual({field: 'distinct_c'});
    });
  });

  describe('assembleLayout', () => {
    it('returns a layout with a column signal for facet with column', () => {
      const model = parseFacetModelWithScale({
        facet: {
          column: {field: 'a', type: 'ordinal'},
        },
        spec: {
          mark: 'point',
          encoding: {
            x: {field: 'b', type: 'quantitative'},
          },
        },
      });
      const layout = model.assembleLayout();
      expect(layout).toEqual({
        padding: DEFAULT_SPACING,
        columns: {
          signal: "length(data('column_domain'))",
        },
        bounds: 'full',
        align: 'all',
      });
    });

    it('should not align independent scales for column', () => {
      const model = parseFacetModelWithScale({
        facet: {
          column: {field: 'a', type: 'ordinal'},
        },
        spec: {
          mark: 'point',
          encoding: {
            x: {field: 'b', type: 'ordinal'},
          },
        },
        resolve: {
          scale: {
            x: 'independent',
          },
        },
      });
      const layout = model.assembleLayout();
      expect(layout).toEqual({
        padding: DEFAULT_SPACING,
        columns: {
          signal: "length(data('column_domain'))",
        },
        bounds: 'full',
        align: 'none',
      });
    });

    it('should not align independent scales for row', () => {
      const model = parseFacetModelWithScale({
        facet: {
          row: {field: 'a', type: 'ordinal'},
        },
        spec: {
          mark: 'point',
          encoding: {
            y: {field: 'b', type: 'ordinal'},
          },
        },
        resolve: {
          scale: {
            y: 'independent',
          },
        },
      });
      const layout = model.assembleLayout();
      expect(layout).toEqual({
        padding: DEFAULT_SPACING,
        columns: 1,
        bounds: 'full',
        align: 'none',
      });
    });

    it('returns a layout without a column signal for facet with column that parent is also a facet.', () => {
      const model = parseFacetModelWithScale({
        facet: {
          column: {field: 'a', type: 'ordinal'},
        },
        spec: {
          facet: {
            column: {field: 'c', type: 'ordinal'},
          },
          spec: {
            mark: 'point',
            encoding: {
              x: {field: 'b', type: 'quantitative'},
            },
          },
        },
        // TODO: remove "any" once we support all facet listed in https://github.com/vega/vega-lite/issues/2760
      } as any);
      const layout = model.child.assembleLayout();
      expect(layout).not.toHaveProperty('columns');
    });

    it('correctly applies columns config.', () => {
      const model = parseFacetModelWithScale({
        facet: {field: 'a', type: 'ordinal'},
        spec: {
          facet: {
            column: {field: 'c', type: 'ordinal'},
          },
          spec: {
            mark: 'point',
            encoding: {
              x: {field: 'b', type: 'quantitative'},
            },
          },
        },
        config: {facet: {columns: 3}},
        // TODO: remove "any" once we support all facet listed in https://github.com/vega/vega-lite/issues/2760
      } as any);

      expect(model.layout).toMatchObject({columns: 3});
    });

    it('returns a layout with header band if child spec is also a facet', () => {
      const model = parseFacetModelWithScale({
        data: {url: 'data/cars.json'},
        facet: {row: {field: 'Origin', type: 'ordinal'}},
        spec: {
          facet: {row: {field: 'Cylinders', type: 'ordinal'}},
          spec: {
            mark: 'point',
            encoding: {
              x: {field: 'Horsepower', type: 'quantitative'},
              y: {field: 'Acceleration', type: 'quantitative'},
            },
          },
        },
        // TODO: remove "any" once we support all facet listed in https://github.com/vega/vega-lite/issues/2760
      } as any);
      model.parseLayoutSize();
      model.parseAxesAndHeaders();
      const layout = model.assembleLayout();
      expect(layout.headerBand).toEqual({row: 0.5});
    });

    it('returns a layout with titleAnchor ="end" when titleOrient is right', () => {
      const model = parseFacetModelWithScale({
        data: {url: 'data/cars.json'},
        facet: {row: {field: 'Origin', type: 'ordinal', header: {titleOrient: 'right'}}},
        spec: {
          mark: 'point',
          encoding: {
            x: {field: 'Horsepower', type: 'quantitative'},
            y: {field: 'Acceleration', type: 'quantitative'},
          },
        },
        // TODO: remove "any" once we support all facet listed in https://github.com/vega/vega-lite/issues/2760
      } as any);
      model.parseLayoutSize();
      model.parseAxesAndHeaders();
      const layout = model.assembleLayout();
      expect(layout.titleAnchor).toEqual({row: 'end'});
    });

    it('returns a layout with titleAnchor ="end" when titleOrient is bottom', () => {
      const model = parseFacetModelWithScale({
        data: {url: 'data/cars.json'},
        facet: {column: {field: 'Origin', type: 'ordinal', header: {titleOrient: 'bottom'}}},
        spec: {
          mark: 'point',
          encoding: {
            x: {field: 'Horsepower', type: 'quantitative'},
            y: {field: 'Acceleration', type: 'quantitative'},
          },
        },
        // TODO: remove "any" once we support all facet listed in https://github.com/vega/vega-lite/issues/2760
      } as any);
      model.parseLayoutSize();
      model.parseAxesAndHeaders();
      const layout = model.assembleLayout();
      expect(layout.titleAnchor).toEqual({column: 'end'});
    });
  });

  describe('assembleMarks', () => {
    it('add label title for orthogonal orient label', () => {
      const facet: FacetMapping<string, FacetFieldDef<string, SignalRef>> = {
        row: {field: 'a', type: 'ordinal', header: {labelOrient: 'top'}},
      };
      const model: FacetModel = parseFacetModelWithScale({
        facet,
        spec: {
          mark: 'point',
          encoding: {
            x: {field: 'c', type: 'quantitative'},
          },
        },
      });
      model.parse();

      const marks = model.assembleMarks();

      expect(marks[0].title).toEqual(assembleLabelTitle(facet.row, 'row', model.config));
    });

    it('should add cross and sort if we facet by multiple dimensions', () => {
      const model: FacetModel = parseFacetModelWithScale({
        facet: {
          row: {field: 'a', type: 'ordinal'},
          column: {field: 'b', type: 'ordinal'},
        },
        spec: {
          mark: 'point',
          encoding: {
            x: {field: 'c', type: 'quantitative'},
          },
        },
      });
      model.parse();

      const marks = model.assembleMarks();

      expect(marks[0].from.facet.aggregate.cross).toBeTruthy();
      expect(marks[0].sort).toEqual({
        field: ['datum["a"]', 'datum["b"]'],
        order: ['ascending', 'ascending'],
      });
    });

    it('should add cross and sort if we facet by multiple dimensions with sort array', () => {
      const model: FacetModel = parseFacetModelWithScale({
        facet: {
          row: {field: 'a', type: 'ordinal', sort: ['a1', 'a2']},
          column: {field: 'b', type: 'ordinal', sort: ['b1', 'b2']},
        },
        spec: {
          mark: 'point',
          encoding: {
            x: {field: 'c', type: 'quantitative'},
          },
        },
      });
      model.parse();

      const marks = model.assembleMarks();

      expect(marks[0].from.facet.aggregate.cross).toBeTruthy();
      expect(marks[0].sort).toEqual({
        field: ['datum["row_a_sort_index"]', 'datum["column_b_sort_index"]'],
        order: ['ascending', 'ascending'],
      });
    });

    it('should add cross and sort if we facet by multiple dimensions with sort fields', () => {
      const model: FacetModel = parseFacetModelWithScale({
        facet: {
          row: {field: 'a', type: 'ordinal', sort: {field: 'd', op: 'median'}},
          column: {field: 'b', type: 'ordinal', sort: {field: 'e', op: 'median'}},
        },
        spec: {
          mark: 'point',
          encoding: {
            x: {field: 'c', type: 'quantitative'},
          },
        },
      });
      model.parse();

      const marks = model.assembleMarks();

      expect(marks[0].from.facet.aggregate).toEqual({
        cross: true,
        fields: ['median_d_by_a', 'median_e_by_b'],
        ops: ['max', 'max'],
        as: ['median_d_by_a', 'median_e_by_b'],
      });

      expect(marks[0].sort).toEqual({
        field: ['datum["median_d_by_a"]', 'datum["median_e_by_b"]'],
        order: ['ascending', 'ascending'],
      });
    });

    it('should sort cells by an escaped sort field, matching the header order', () => {
      const model: FacetModel = parseFacetModelWithScale({
        facet: {
          column: {
            field: 'o\\.status',
            type: 'nominal',
            sort: {field: 'o\\.status__sort', order: 'ascending'},
          },
        },
        spec: {
          mark: 'bar',
          encoding: {
            y: {field: 'o\\.count', type: 'quantitative'},
          },
        },
      });
      model.parse();

      const marks = model.assembleMarks();

      expect(marks[0].from.facet.aggregate).toEqual({
        fields: ['o\\.status__sort'],
        ops: ['min'],
        as: ['o.status__sort_by_o.status'],
      });

      // A name the aggregate didn't produce resolves to undefined, and the cells
      // silently keep source order.
      expect(marks[0].sort).toEqual({
        field: ['datum["o.status__sort_by_o.status"]'],
        order: ['ascending'],
      });
    });

    it('should sort crossed cells by escaped sort fields', () => {
      const model: FacetModel = parseFacetModelWithScale({
        facet: {
          row: {field: 'o\\.region', type: 'ordinal', sort: {field: 'o\\.r__sort', op: 'median'}},
          column: {field: 'o\\.status', type: 'ordinal', sort: {field: 'o\\.s__sort', op: 'median'}},
        },
        spec: {
          mark: 'point',
          encoding: {
            x: {field: 'o\\.count', type: 'quantitative'},
          },
        },
      });
      model.parse();

      const marks = model.assembleMarks();

      expect(marks[0].from.facet.aggregate).toEqual({
        cross: true,
        fields: ['median_o\\.r__sort_by_o\\.region', 'median_o\\.s__sort_by_o\\.status'],
        ops: ['max', 'max'],
        as: ['median_o.r__sort_by_o.region', 'median_o.s__sort_by_o.status'],
      });

      expect(marks[0].sort).toEqual({
        field: ['datum["median_o.r__sort_by_o.region"]', 'datum["median_o.s__sort_by_o.status"]'],
        order: ['ascending', 'ascending'],
      });
    });

    it('should sort cells by an escaped sort array index field', () => {
      const model: FacetModel = parseFacetModelWithScale({
        facet: {
          column: {field: 'o\\.status', type: 'ordinal', sort: ['Complete', 'Cancelled']},
        },
        spec: {
          mark: 'point',
          encoding: {
            x: {field: 'o\\.count', type: 'quantitative'},
          },
        },
      });
      model.parse();

      const marks = model.assembleMarks();

      expect(marks[0].from.facet.aggregate).toEqual({
        fields: ['column_o\\.status_sort_index'],
        ops: ['max'],
        as: ['column_o.status_sort_index'],
      });

      expect(marks[0].sort).toEqual({
        field: ['datum["column_o.status_sort_index"]'],
        order: ['ascending'],
      });
    });

    it('should add calculate cardinality for independent scales', () => {
      const model: FacetModel = parseFacetModelWithScale({
        facet: {
          row: {field: 'a', type: 'ordinal'},
        },
        spec: {
          mark: 'rect',
          encoding: {
            x: {field: 'b', type: 'nominal'},
            y: {field: 'c', type: 'nominal'},
          },
        },
        resolve: {
          scale: {
            x: 'independent',
            y: 'independent',
          },
        },
      });
      model.parse();

      const marks = model.assembleMarks();

      expect(marks[0].from.facet.aggregate).toEqual({
        fields: ['b', 'c'],
        ops: ['distinct', 'distinct'],
        as: ['distinct_b', 'distinct_c'],
      });
    });

    it('should add calculate cardinality for child column facet', () => {
      const model: FacetModel = parseFacetModelWithScale({
        facet: {
          column: {field: 'a', type: 'nominal'},
        },
        spec: {
          facet: {
            column: {field: 'c', type: 'nominal'},
          },
          spec: {
            mark: 'point',
            encoding: {
              x: {field: 'b', type: 'quantitative'},
            },
          },
        },
        // TODO: remove "any" once we support all facet listed in https://github.com/vega/vega-lite/issues/2760
      } as any);
      model.parse();

      const marks = model.assembleMarks();

      expect(marks[0].from.facet.aggregate).toEqual({
        fields: ['c'],
        ops: ['distinct'],
        as: ['distinct_c'],
      });
    });

    it('includes both bin start and end in the facet groupby', () => {
      const model: FacetModel = parseFacetModelWithScale({
        facet: {
          column: {bin: true, field: 'a', type: 'quantitative'},
        },
        spec: {
          mark: 'point',
          encoding: {
            x: {field: 'b', type: 'quantitative'},
          },
        },
      });
      model.parse();

      const marks = model.assembleMarks();

      expect(marks[0].from.facet.groupby).toEqual(['bin_maxbins_6_a', 'bin_maxbins_6_a_end']);
    });
  });
});
