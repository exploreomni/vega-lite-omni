/**
 * Data type based on level of measurement
 */
export declare const Type: {
    readonly quantitative: "quantitative";
    readonly ordinal: "ordinal";
    readonly temporal: "temporal";
    readonly nominal: "nominal";
    readonly geojson: "geojson";
};
export type Type = keyof typeof Type;
export declare function isType(t: any): t is Type;
/**
 * Type-only continuous check (does not consider binning).
 * A binned quantitative field still counts as continuous here, whereas the
 * field-aware `isDiscrete` in `./channeldef.js` treats it as discrete.
 */
export declare function isContinuous(type: Type): type is 'quantitative' | 'temporal';
/**
 * Type-only discrete check (does not consider binning).
 * For a field-aware version that treats binned quantitative fields as discrete,
 * use `isDiscrete` from `./channeldef.js`.
 * Note: `tooltipRefForEncoding` relies on this type-only check so that binned
 * quantitative fields keep the bin-range tooltip format instead of the
 * discrete format.
 */
export declare function isDiscrete(type: Type): type is 'ordinal' | 'nominal';
export declare const QUANTITATIVE: "quantitative";
export declare const ORDINAL: "ordinal";
export declare const TEMPORAL: "temporal";
export declare const NOMINAL: "nominal";
export declare const GEOJSON: "geojson";
export type StandardType = 'quantitative' | 'ordinal' | 'temporal' | 'nominal';
export declare const TYPES: ("ordinal" | "quantitative" | "temporal" | "nominal" | "geojson")[];
/**
 * Get full, lowercase type name for a given type.
 * @param  type
 * @return Full type name.
 */
export declare function getFullName(type: Type | string): Type | undefined;
//# sourceMappingURL=type.d.ts.map