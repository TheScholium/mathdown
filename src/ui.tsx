/**
 * Small e-ink widgets: Button, Segmented control, Prompt and Confirm dialogs.
 */
import React, {useEffect, useState} from 'react';
import {Pressable, StyleProp, Switch, Text, TextInput, View, ViewStyle} from 'react-native';
import {GRAY, INK, LIGHT, PAPER, S} from './theme';

export function Button(props: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  bold?: boolean;
  small?: boolean;
  active?: boolean;
  testID?: string;
}) {
  const {label, onPress, disabled, style, small, active} = props;
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
        disabled ? S.btnDisabled : null,
        (pressed || active) && !disabled ? S.btnPressed : null,
        style,
      ]}>
      {({pressed}) => (
        <Text
          numberOfLines={1}
          style={[
            S.btnText,
            small ? {fontSize: 15} : null,
            disabled ? S.btnTextDisabled : null,
            (pressed || active) && !disabled ? S.btnTextPressed : null,
          ]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function Segmented<T extends string>(props: {
  value: T;
  options: {value: T; label: string}[];
  onChange: (v: T) => void;
}) {
  return (
    <View style={{flexDirection: 'row', alignSelf: 'flex-start', borderWidth: 2, borderColor: INK, borderRadius: 6, overflow: 'hidden', marginHorizontal: 3}}>
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
              backgroundColor: on ? INK : PAPER,
              borderLeftWidth: i ? 2 : 0,
              borderColor: INK,
            }}>
            <Text style={{fontSize: 16, fontWeight: '600', color: on ? PAPER : INK}}>{o.label}</Text>
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
  if (!props.visible) return null;
  return (
    <View
      style={{position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.75)', justifyContent: 'flex-start', paddingHorizontal: 28, paddingTop: 90, zIndex: 100, elevation: 100}}>
      <Pressable style={{position: 'absolute', left: 0, top: 0, right: 0, bottom: 0}} onPress={props.onClose} />
      <View style={{backgroundColor: PAPER, borderWidth: 3, borderColor: INK, borderRadius: 8, padding: 18}}>{props.children}</View>
    </View>
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
  const [value, setValue] = useState(props.initial || '');
  useEffect(() => {
    if (props.visible) setValue(props.initial || '');
  }, [props.visible, props.initial]);
  return (
    <Sheet visible={props.visible} onClose={props.onCancel}>
      <Text style={[S.label, {fontSize: 19, marginBottom: 8}]}>{props.title}</Text>
      {props.message ? <Text style={[S.hint, {marginBottom: 10}]}>{props.message}</Text> : null}
      <TextInput
        value={value}
        onChangeText={setValue}
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        style={S.input}
        onSubmitEditing={() => props.onOk(value)}
      />
      <View style={{flexDirection: 'row', justifyContent: 'flex-end', marginTop: 14}}>
        <Button label="Cancel" onPress={props.onCancel} />
        <Button label={props.okLabel || 'OK'} onPress={() => props.onOk(value)} />
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
  const spec = props.spec;
  return (
    <Sheet visible={!!spec} onClose={props.onClose}>
      {spec ? (
        <>
          <Text style={[S.label, {fontSize: 19, marginBottom: 8}]}>{spec.title}</Text>
          {spec.message ? <Text style={[S.bannerText, {marginBottom: 12}]}>{spec.message}</Text> : null}
          <View style={{flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap'}}>
            {spec.buttons.map(b => (
              <Button
                key={b.label}
                label={b.label}
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

/** Black-and-white switch (the default teal is a poor fit for e-ink). */
export function InkSwitch(props: {value: boolean; onValueChange: (v: boolean) => void}) {
  return (
    <Switch
      value={props.value}
      onValueChange={props.onValueChange}
      trackColor={{false: LIGHT, true: GRAY}}
      thumbColor={props.value ? INK : PAPER}
    />
  );
}
