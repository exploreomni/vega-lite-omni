import type { SignalRef } from 'vega';
import type { Mark, MarkDef } from '../../../mark.js';
import { VgEncodeEntry } from '../../../vega.schema.js';
import { UnitModel } from '../../unit.js';
export type CornerRadiusEnd = NonNullable<MarkDef<Mark, SignalRef>['cornerRadiusEnd']>;
interface StackedBarCornerRadiusFields {
    minStart: string;
    maxStart: string;
    minEnd: string;
    maxEnd: string;
}
export declare function cornerRadiusEnd(model: UnitModel, encodeEntry: VgEncodeEntry): VgEncodeEntry;
export declare function cornerRadiusEndForStackedBar(model: UnitModel, radius: CornerRadiusEnd | undefined, scaleName: string, fields: StackedBarCornerRadiusFields): VgEncodeEntry;
export {};
//# sourceMappingURL=corner-radius.d.ts.map