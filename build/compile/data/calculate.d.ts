import { FormulaTransform as VgFormulaTransform } from 'vega';
import { ExtendedChannel } from '../../channel.js';
import { FieldRefOption, TypedFieldDef } from '../../channeldef.js';
import { CalculateTransform } from '../../transform.js';
import { ModelWithField } from '../model.js';
import { DataFlowNode } from './dataflow.js';
export declare class CalculateNode extends DataFlowNode {
    private readonly transform;
    private _dependentFields;
    clone(): CalculateNode;
    constructor(parent: DataFlowNode, transform: CalculateTransform);
    static parseAllForSortIndex(parent: DataFlowNode, model: ModelWithField): DataFlowNode;
    producedFields(): Set<string>;
    dependentFields(): Set<string>;
    assemble(): VgFormulaTransform;
    hash(): string;
}
export declare function sortArrayIndexField(fieldDef: TypedFieldDef<string>, channel: ExtendedChannel, opt?: FieldRefOption): string;
//# sourceMappingURL=calculate.d.ts.map