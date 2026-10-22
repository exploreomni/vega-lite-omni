import {getSecondaryRangeChannel, PositionScaleChannel} from '../../channel.js';
import {channelDefType, getFieldOrDatumDef, isFieldDef, isPositionFieldOrDatumDef} from '../../channeldef.js';
import {formatCustomType, isCustomFormatType} from '../format.js';
import {UnitModel} from '../unit.js';

export function labels(model: UnitModel, channel: PositionScaleChannel, specifiedLabelsSpec: any) {
  const {encoding, config} = model;

  const fieldOrDatumDef =
    getFieldOrDatumDef<string>(encoding[channel]) ?? getFieldOrDatumDef(encoding[getSecondaryRangeChannel(channel)]);
  const axis = model.axis(channel) || {};
  const {format, formatType} = axis;
  const logScale = model.getScaleComponent(channel)?.get('type') === 'log';

  // Vega blanks most of a log axis's tick labels, but only in datum.label; a custom
  // format reads datum.value, so it keeps that choice by labeling only what Vega did.
  const customText = (custom: {format: typeof format; formatType: string}) => {
    const text = formatCustomType({fieldOrDatumDef, field: 'datum.value', ...custom, config});
    return logScale ? {signal: `datum.label ? ${text.signal} : ''`} : text;
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
