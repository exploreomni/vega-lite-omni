import { Channel } from '../../../channel.js';
import { Config } from '../../../config.js';
import { Encoding } from '../../../encoding.js';
import { StackProperties } from '../../../stack.js';
import { VgValueRef } from '../../../vega.schema.js';
import { UnitModel } from '../../unit.js';
export declare function tooltip(model: UnitModel, opt?: {
    reactiveGeom?: boolean;
}): Partial<Record<import("../../../vega.schema.js").VgEncodeChannel, VgValueRef | (VgValueRef & {
    test?: string;
})[]>> | {
    tooltip: {
        signal: string;
    };
};
export type TooltipTuple = {
    channel: Channel;
    key: string;
    value: string;
    test?: string;
};
export declare function tooltipDataTuples(encoding: Encoding<string>, stack: StackProperties, config: Config, { reactiveGeom }?: {
    reactiveGeom?: boolean;
}): TooltipTuple[];
export declare function tooltipRefForEncoding(encoding: Encoding<string>, stack: StackProperties, config: Config, { reactiveGeom }?: {
    reactiveGeom?: boolean;
}): {
    signal: string;
};
//# sourceMappingURL=tooltip.d.ts.map