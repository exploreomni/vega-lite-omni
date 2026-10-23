import {getSecondaryRangeChannel, PositionScaleChannel} from '../../channel.js';
import {channelDefType, getFieldOrDatumDef, isFieldDef, isPositionFieldOrDatumDef} from '../../channeldef.js';
import {formatCustomType, isCustomFormatType} from '../format.js';
import {UnitModel} from '../unit.js';
import {defaultBandPosition} from './properties.js';

export function labels(model: UnitModel, channel: PositionScaleChannel, specifiedLabelsSpec: any) {
  return labelsPositionSpec(model, channel, labelsTextSpec(model, channel, specifiedLabelsSpec));
}

function labelsTextSpec(model: UnitModel, channel: PositionScaleChannel, specifiedLabelsSpec: any) {
  const {encoding, config} = model;

  const fieldOrDatumDef =
    getFieldOrDatumDef<string>(encoding[channel]) ?? getFieldOrDatumDef(encoding[getSecondaryRangeChannel(channel)]);
  const axis = model.axis(channel) || {};
  const {format, formatType} = axis;
  const logScale = model.getScaleComponent(channel)?.get('type') === 'log';

  // Vega blanks most of a log axis's tick labels, but only in datum.label; a custom
  // format reads datum.value, so it keeps that choice by labeling only what Vega did.
  // Parenthesized, as a labelExpr substitutes it for datum.label.
  const customText = (custom: {format: typeof format; formatType: string}) => {
    const text = formatCustomType({fieldOrDatumDef, field: 'datum.value', ...custom, config});
    return logScale ? {signal: `(datum.label ? ${text.signal} : '')`} : text;
  };

  if (isCustomFormatType(formatType)) {
    return {
      text: customText({format, formatType}),
      ...specifiedLabelsSpec,
    };
  } else if (format === undefined && formatType === undefined && config.customFormatTypes) {
    if (channelDefType(fieldOrDatumDef) === 'quantitative') {
      if (
        isPositionFieldOrDatumDef(fieldOrDatumDef) &&
        fieldOrDatumDef.stack === 'normalize' &&
        config.normalizedNumberFormatType
      ) {
        return {
          text: customText({format: config.normalizedNumberFormat, formatType: config.normalizedNumberFormatType}),
          ...specifiedLabelsSpec,
        };
      } else if (config.numberFormatType) {
        return {
          text: customText({format: config.numberFormat, formatType: config.numberFormatType}),
          ...specifiedLabelsSpec,
        };
      }
    }
    if (
      channelDefType(fieldOrDatumDef) === 'temporal' &&
      config.timeFormatType &&
      isFieldDef(fieldOrDatumDef) &&
      !fieldOrDatumDef.timeUnit
    ) {
      return {
        text: customText({format: config.timeFormat, formatType: config.timeFormatType}),
        ...specifiedLabelsSpec,
      };
    }
  }
  return specifiedLabelsSpec;
}

/**
 * Vega positions band-scale axis labels at the band center regardless of the axis `bandPosition`
 * (only ticks and grid lines move), so ranged offset marks need an explicit label position
 * override to anchor the labels at the in-band baseline.
 */
function labelsPositionSpec(model: UnitModel, channel: PositionScaleChannel, specifiedLabelsSpec: any) {
  if ('x' in specifiedLabelsSpec || 'y' in specifiedLabelsSpec) {
    return specifiedLabelsSpec;
  }

  const inferredBandPosition = defaultBandPosition(model, channel);

  if (inferredBandPosition === undefined) {
    // Without an offset-driven band position, Vega's axis handles any specified bandPosition natively.
    return specifiedLabelsSpec;
  }

  const bandPosition = model.axis(channel)?.bandPosition ?? inferredBandPosition;

  if (bandPosition === 0.5) {
    return specifiedLabelsSpec;
  }

  const positionRef = {
    scale: model.scaleName(channel),
    signal: 'datum.value',
    band: bandPosition,
  };

  return {
    ...(channel === 'x' ? {x: positionRef} : {y: positionRef}),
    ...specifiedLabelsSpec,
  };
}
