import type { AggregateOp } from 'vega';
import { FieldName } from './channeldef.js';
export declare const MULTIDOMAIN_SORT_OP_INDEX: {
    count: number;
    min: number;
    max: number;
};
export interface ArgminDef {
    argmin: FieldName;
}
export interface ArgmaxDef {
    argmax: FieldName;
}
export interface ExponentialDef {
    exponential: number;
}
export interface ExponentialBDef {
    exponentialb: number;
}
export type NonArgAggregateOp = Exclude<AggregateOp, 'argmin' | 'argmax' | 'exponential' | 'exponentialb'>;
export type Aggregate = NonArgAggregateOp | ArgmaxDef | ArgminDef | ExponentialDef | ExponentialBDef;
export declare function isArgminDef(a: Aggregate | string): a is ArgminDef;
export declare function isArgmaxDef(a: Aggregate | string): a is ArgmaxDef;
export declare function isExponentialDef(a: Aggregate | string): a is ExponentialDef;
export declare function isExponentialBDef(a: Aggregate | string): a is ExponentialBDef;
/**
 * An aggregate operation that takes an aggregate parameter, expressed as an object such as `{"exponential": 0.5}`.
 */
export type ParameterizedAggregateDef = ExponentialDef | ExponentialBDef;
export declare function isParameterizedAggregateDef(a: Aggregate | string): a is ParameterizedAggregateDef;
/**
 * Returns the operation name for an aggregate, unwrapping parameterized aggregate defs to their op.
 */
export declare function getAggregateOp(a: ParameterizedAggregateDef): 'exponential' | 'exponentialb';
export declare function getAggregateOp<T extends string>(a: T | ParameterizedAggregateDef): T | 'exponential' | 'exponentialb';
/**
 * Returns the parameter of a parameterized aggregate def, or `undefined` for other aggregates.
 */
export declare function getAggregateParam(a: Aggregate | string): number | undefined;
export declare function isAggregateOp(a: string | ArgminDef | ArgmaxDef | ParameterizedAggregateDef): a is AggregateOp;
export declare const COUNTING_OPS: ReadonlySet<NonArgAggregateOp>;
export declare function isCountingAggregateOp(aggregate?: string | Aggregate): boolean;
export declare function isMinMaxOp(aggregate?: Aggregate | string): boolean;
/** Additive-based aggregation operations. These can be applied to stack. */
export declare const SUM_OPS: ReadonlySet<NonArgAggregateOp>;
/**
 * Aggregation operators that always produce values within the range [domainMin, domainMax].
 */
export declare const SHARED_DOMAIN_OPS: ReadonlySet<AggregateOp>;
//# sourceMappingURL=aggregate.d.ts.map