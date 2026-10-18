/**
 * Small widgets in the Istari style: Button, Icon, Segmented control,
 * Prompt and Confirm dialogs, and a switch.
 *
 * Buttons follow Istari's interface chrome: a hairline gold-dim border,
 * a small-caps gold label, and a gold-dim fill for the call to action
 * (button.mod-cta) and for the pressed state.
 */
import React, {useEffect, useState} from 'react';
import {Image, Pressable, StyleProp, Switch, Text, TextInput, View, ViewStyle} from 'react-native';
import {ICONS, IconName} from './icons';
import {track, useTheme} from './theme';

export function Icon(props: {name: IconName; size: number; color: string; style?: any}) {
  return (
    <Image
      source={ICONS[props.name]}
      style={[{width: props.size, height: props.size, tintColor: props.color}, props.style]}
      fadeDuration={0}
      resizeMode="contain"
    />
  );
}

export function Button(props: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Call to action: gold-dim fill. */
  cta?: boolean;
  small?: boolean;
  active?: boolean;
  /** Icon before the label; with iconOnly the label is only for accessibility. */
  icon?: IconName;
  iconOnly?: boolean;
  /** Literal label (TeX snippets): no small caps or tracking. */
  plain?: boolean;
  testID?: string;
}) {
  const {S, p} = useTheme();
  const {label, onPress, disabled, style, small, active, cta, icon, iconOnly} = props;
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      android_ripple={undefined}
      style={({pressed}) => [
        S.btn,
        small ? {minHeight: 36, paddingHorizontal: 8} : null,
        iconOnly ? {paddingHorizontal: 0, minWidth: small ? 36 : 44} : null,
        cta && !disabled ? S.btnPressed : null,
        disabled ? S.btnDisabled : null,
        (pressed || active) && !disabled ? S.btnPressed : null,
        style,
      ]}>
      {({pressed}) => {
        const on = ((pressed || active) && !disabled) || (cta && !disabled);
        const color = disabled ? p.faint : on ? p.onAccent : p.gold;
        const size = small ? 16 : 17;
        return (
          <View style={{flexDirection: 'row', alignItems: 'center'}}>
            {icon ? <Icon name={icon} size={small ? 20 : 22} color={color} /> : null}
            {iconOnly ? null : (
              <Text
                numberOfLines={1}
                style={[
                  S.btnText,
                  props.plain ? {fontSize: size, fontVariant: [], letterSpacing: 0} : {fontSize: size, letterSpacing: track(size, 0.05)},
                  icon ? {marginLeft: 6} : null,
                  disabled ? S.btnTextDisabled : null,
                  on ? S.btnTextPressed : null,
                ]}>
                {label}
              </Text>
            )}
          </View>
        );
      }}
    </Pressable>
  );
}

export function Segmented<T extends string>(props: {
  value: T;
  options: {value: T; label: string}[];
  onChange: (v: T) => void;
}) {
  const {p, S} = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignSelf: 'flex-start',
        borderWidth: 1,
        borderColor: p.goldDim,
        borderRadius: 2,
        overflow: 'hidden',
        marginHorizontal: 3,
      }}>
      {props.options.map((o, i) => {
        const on = o.value === props.value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{selected: on}}
            onPress={() => props.onChange(o.value)}
            style={{
              paddingHorizontal: 12,
              minHeight: 38,
              justifyContent: 'center',
              backgroundColor: on ? p.goldDim : 'transparent',
              borderLeftWidth: i ? 1 : 0,
              borderColor: p.goldDim,
            }}>
            <Text style={[S.btnText, {color: on ? p.onAccent : p.gold}]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Dialog sheet drawn as an overlay inside our own view. (React Native's
 * Modal opens a new Android window, which the plugin host may not allow.)
 * Render it as the last child of a full-screen view.
 */
function Sheet(props: {visible: boolean; children: React.ReactNode; onClose: () => void}) {
  const {p} = useTheme();
  if (!props.visible) return null;
  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        backgroundColor: p.scrim,
        justifyContent: 'flex-start',
        paddingHorizontal: 28,
        paddingTop: 90,
        zIndex: 100,
        elevation: 100,
      }}>
      <Pressable style={{position: 'absolute', left: 0, top: 0, right: 0, bottom: 0}} onPress={props.onClose} />
      <View
        style={{
          backgroundColor: p.bg,
          borderWidth: 1,
          borderColor: p.dark ? p.rule : p.goldDim,
          borderRadius: 3,
          padding: 18,
        }}>
        {props.children}
      </View>
    </View>
  );
}

function SheetTitle(props: {children: React.ReactNode}) {
  const {p, f} = useTheme();
  return (
    <Text style={{fontFamily: f.title, fontSize: 26, color: p.bright, marginBottom: 6, fontStyle: 'italic'}}>
      {props.children}
    </Text>
  );
}

export function Prompt(props: {
  visible: boolean;
  title: string;
  message?: string;
  initial?: string;
  okLabel?: string;
  onOk: (value: string) => void;
  onCancel: () => void;
}) {
  const {S, p} = useTheme();
  const [value, setValue] = useState(props.initial || '');
  useEffect(() => {
    if (props.visible) setValue(props.initial || '');
  }, [props.visible, props.initial]);
  return (
    <Sheet visible={props.visible} onClose={props.onCancel}>
      <SheetTitle>{props.title}</SheetTitle>
      {props.message ? <Text style={[S.hint, {marginBottom: 10}]}>{props.message}</Text> : null}
      <TextInput
        value={value}
        onChangeText={setValue}
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        cursorColor={p.gold}
        selectionColor={p.highlight}
        style={[S.input, {borderColor: p.goldDim}]}
        onSubmitEditing={() => props.onOk(value)}
      />
      <View style={{flexDirection: 'row', justifyContent: 'flex-end', marginTop: 14}}>
        <Button label="Cancel" onPress={props.onCancel} />
        <Button label={props.okLabel || 'OK'} cta onPress={() => props.onOk(value)} />
      </View>
    </Sheet>
  );
}

export type ConfirmSpec = {
  title: string;
  message?: string;
  buttons: {label: string; onPress: () => void}[];
} | null;

export function Confirm(props: {spec: ConfirmSpec; onClose: () => void}) {
  const {S} = useTheme();
  const spec = props.spec;
  return (
    <Sheet visible={!!spec} onClose={props.onClose}>
      {spec ? (
        <>
          <SheetTitle>{spec.title}</SheetTitle>
          {spec.message ? <Text style={[S.bannerText, {marginBottom: 12}]}>{spec.message}</Text> : null}
          <View style={{flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap'}}>
            {spec.buttons.map((b, i) => (
              <Button
                key={b.label}
                label={b.label}
                cta={i === spec.buttons.length - 1 && spec.buttons.length > 1}
                style={{marginTop: 6}}
                onPress={() => {
                  props.onClose();
                  b.onPress();
                }}
              />
            ))}
          </View>
        </>
      ) : null}
    </Sheet>
  );
}

/** Switch with Istari's gold-dim track (.checkbox-container.is-enabled). */
export function InkSwitch(props: {value: boolean; onValueChange: (v: boolean) => void}) {
  const {p} = useTheme();
  return (
    <Switch
      value={props.value}
      onValueChange={props.onValueChange}
      trackColor={{false: p.rule, true: p.goldDim}}
      thumbColor={props.value ? p.gold : p.dark ? p.muted : p.bg3}
    />
  );
}
