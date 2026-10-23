import type { SignalRef } from 'vega';
import { FacetChannel } from '../../channel.js';
import { EncodingFacetMapping } from '../../spec/facet.js';
import { VgData } from '../../vega.schema.js';
import { FacetModel } from '../facet.js';
import { DataFlowNode } from './dataflow.js';
/**
 * The key a crossed facet's headers and rank scale both sort by. It has no escapes:
 * Vega before 6.3 named a domain sort's aggregate after the escaped field reference,
 * so a dotted name never matched.
 */
export declare function rankSortKey(channel: FacetChannel): string;
/**
 * The channels of a crossed facet whose cells sort by rank. `cross` adds a cell for
 * each missing (row, column) pair, and with no tuples it gets no aggregated sort key,
 * so it would sort first and shift every later cell out from under its header. Its
 * groupby values survive, so each cell instead takes its header's place in a scale
 * over the header domain, sorted as the headers are.
 */
export declare function rankedChannels(facet: EncodingFacetMapping<string, SignalRef>): FacetChannel[];
/**
 * A node that helps us track what fields we are faceting by.
 */
export declare class FacetNode extends DataFlowNode {
    readonly model: FacetModel;
    readonly name: string;
    data: string;
    private readonly column;
    private readonly row;
    private readonly facet;
    private readonly childModel;
    /**
     * @param model The facet model.
     * @param name The name that this facet source will have.
     * @param data The source data for this facet data.
     */
    constructor(parent: DataFlowNode, model: FacetModel, name: string, data: string);
    hash(): string;
    get fields(): string[];
    dependentFields(): Set<string>;
    producedFields(): Set<string>;
    /**
     * The name to reference this source is its name.
     */
    getSource(): string;
    private getChildIndependentFieldsWithStep;
    private assembleRowColumnHeaderData;
    private assembleFacetHeaderData;
    assemble(): VgData[];
}
//# sourceMappingURL=facet.d.ts.map