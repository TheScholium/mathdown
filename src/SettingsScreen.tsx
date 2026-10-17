/**
 * Settings screen.
 */
import React, {useState} from 'react';
import {ScrollView, Text, TextInput, View} from 'react-native';
import {DEFAULT_SETTINGS, DEFAULT_VAULT, EXPORT_DIR, Settings, canWrite} from './storage';
import {GRAY, INK, MONO, S} from './theme';
import {Button, InkSwitch, Segmented} from './ui';

function Row(props: {title: string; hint?: string; children: React.ReactNode}) {
  return (
    <View style={{paddingVertical: 12, borderBottomWidth: 1, borderColor: '#BBBBBB'}}>
      <Text style={S.label}>{props.title}</Text>
      {props.hint ? <Text style={[S.hint, {marginBottom: 6}]}>{props.hint}</Text> : null}
      {props.children}
    </View>
  );
}

function Stepper(props: {value: number; step: number; min: number; max: number; format?: (v: number) => string; onChange: (v: number) => void}) {
  const fmt = props.format || ((v: number) => String(v));
  const clamp = (v: number) => Math.max(props.min, Math.min(props.max, Math.round(v * 100) / 100));
  return (
    <View style={S.row}>
      <Button label="−" onPress={() => props.onChange(clamp(props.value - props.step))} />
      <Text style={{fontSize: 18, minWidth: 80, textAlign: 'center', color: INK}}>{fmt(props.value)}</Text>
      <Button label="+" onPress={() => props.onChange(clamp(props.value + props.step))} />
    </View>
  );
}

export default function SettingsScreen(props: {settings: Settings; onSave: (s: Settings) => void; onClose: () => void}) {
  const [s, setS] = useState<Settings>(props.settings);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS(prev => ({...prev, [k]: v}));
  const sizeLabel = s.insertEm <= 48 ? 'small' : s.insertEm <= 64 ? 'medium' : s.insertEm <= 88 ? 'large' : 'x-large';

  return (
    <View style={S.fill}>
      <View style={S.bar}>
        <Button label="Cancel" onPress={props.onClose} />
        <Text style={S.barTitle}>Settings</Text>
        <Button label="Save" bold onPress={() => props.onSave(s)} />
      </View>
      <ScrollView contentContainerStyle={{padding: 16, paddingBottom: 60}} overScrollMode="never">
        {!canWrite() ? (
          <View style={[S.banner, {borderWidth: 2, marginBottom: 12}]}>
            <Text style={S.bannerText}>
              The native file module did not load, so settings cannot be stored and notes cannot be saved. Reinstall
              the plugin package (mathdown.snplg).
            </Text>
          </View>
        ) : null}

        <Row
          title="Vault folder"
          hint={'Your notes folder. To share notes with Obsidian, use the folder you open as the vault on your computer. [[Links]] and ![[embeds]] are found anywhere inside it. Default: ' + DEFAULT_VAULT}>
          <TextInput
            value={s.vaultDir}
            onChangeText={v => set('vaultDir', v.trim())}
            autoCapitalize="none"
            autoCorrect={false}
            style={[S.input, {fontFamily: MONO, fontSize: 15}]}
          />
          <View style={[S.row, {marginTop: 6}]}>
            <Button small label="Use default" onPress={() => set('vaultDir', DEFAULT_VAULT)} />
          </View>
        </Row>

        <Row title="Auto-save" hint="Save a note that already has a file 2.5 s after you stop typing, and before you follow a link. Untitled notes still ask for a name.">
          <View style={S.row}>
            <InkSwitch value={s.autoSave} onValueChange={v => set('autoSave', v)} />
            <Text style={{marginLeft: 10, color: INK, fontSize: 16}}>{s.autoSave ? 'On' : 'Off (use Save)'}</Text>
          </View>
        </Row>

        <Row title="Text size" hint="Editor and preview text.">
          <Stepper value={s.fontSize} step={1} min={12} max={34} onChange={v => set('fontSize', v)} />
        </Row>

        <Row title="Math size in preview" hint="Relative to the text size.">
          <Stepper value={s.mathScale} step={0.05} min={0.8} max={1.6} format={v => v.toFixed(2) + '×'} onChange={v => set('mathScale', v)} />
        </Row>

        <Row title="Size of formulas inserted into a note" hint={'Pixels per em at 300 ppi (' + sizeLabel + '). Images go to ' + EXPORT_DIR + '.'}>
          <Stepper value={s.insertEm} step={8} min={32} max={160} format={v => v + ' px'} onChange={v => set('insertEm', v)} />
        </Row>

        <Row title="Live preview" hint="In split view, render after you stop typing.">
          <View style={S.row}>
            <InkSwitch value={s.autoPreview} onValueChange={v => set('autoPreview', v)} />
            <Text style={{marginLeft: 10, color: INK, fontSize: 16}}>{s.autoPreview ? 'On' : 'Off (use the Render button)'}</Text>
          </View>
          {s.autoPreview ? (
            <View style={{marginTop: 8}}>
              <Text style={S.hint}>Delay after the last key stroke</Text>
              <Segmented
                value={String(s.previewDelayMs)}
                options={[
                  {value: '800', label: '0.8 s'},
                  {value: '1500', label: '1.5 s'},
                  {value: '3000', label: '3 s'},
                ]}
                onChange={v => set('previewDelayMs', parseInt(v, 10))}
              />
            </View>
          ) : null}
        </Row>

        <Row title="Close Mathdown after inserting a formula" hint="Then you can move the image with the lasso at once.">
          <InkSwitch value={s.closeAfterInsert} onValueChange={v => set('closeAfterInsert', v)} />
        </Row>

        <Row
          title="Lasso “Render TeX”: remove the text box"
          hint="After rendering a selected text box, delete it and keep only the image. Off: keep both.">
          <InkSwitch value={s.removeTextAfterRender} onValueChange={v => set('removeTextAfterRender', v)} />
        </Row>

        <Row
          title="Global TeX preamble"
          hint={'Definitions for every note, for example:\n\\newcommand{\\e}{\\mathrm{e}}\n\\DeclareMathOperator{\\sgn}{sgn}\n\\R \\C \\N \\Z \\Q are built in.'}>
          <TextInput
            value={s.preamble}
            onChangeText={v => set('preamble', v)}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            textAlignVertical="top"
            style={[S.input, {fontFamily: MONO, fontSize: 15, minHeight: 120}]}
          />
        </Row>

        <View style={[S.row, {marginTop: 16}]}>
          <Button label="Reset all to defaults" onPress={() => setS({...DEFAULT_SETTINGS})} />
        </View>
        <Text style={[S.hint, {marginTop: 20, color: GRAY}]}>
          Mathdown 1.1 · Rendering: MathJax 3 (TeX → SVG) and a JavaScript rasterizer, fully offline.
        </Text>
      </ScrollView>
    </View>
  );
}
