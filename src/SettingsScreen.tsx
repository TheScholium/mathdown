/**
 * Settings screen.
 */
import React, {useState} from 'react';
import {ScrollView, Text, TextInput, View} from 'react-native';
import {DEFAULT_SETTINGS, DEFAULT_VAULT, EXPORT_DIR, Settings, canWrite} from './storage';
import {DATA_FIGURES, useTheme} from './theme';
import {Button, InkSwitch, Segmented} from './ui';

/** A setting, laid out like Istari's properties: small-caps key, italic note, hairline rule. */
function Row(props: {title: string; hint?: string; children: React.ReactNode}) {
  const {S, p} = useTheme();
  return (
    <View style={{paddingVertical: 12, borderBottomWidth: 1, borderColor: p.rule}}>
      <Text style={S.label}>{props.title}</Text>
      {props.hint ? <Text style={[S.hint, {marginBottom: 6}]}>{props.hint}</Text> : null}
      {props.children}
    </View>
  );
}

function Section(props: {title: string}) {
  const {p, f} = useTheme();
  return (
    <Text style={{fontFamily: f.title, fontStyle: 'italic', fontSize: 26, color: p.gold, marginTop: 22, marginBottom: 2}}>
      {props.title}
    </Text>
  );
}

function OnOff(props: {value: boolean; on: string; off: string; onChange: (v: boolean) => void}) {
  const {S, p} = useTheme();
  return (
    <View style={S.row}>
      <InkSwitch value={props.value} onValueChange={props.onChange} />
      <Text style={[S.bannerText, {marginLeft: 10, color: p.muted, fontStyle: 'italic'}]}>{props.value ? props.on : props.off}</Text>
    </View>
  );
}

function Stepper(props: {value: number; step: number; min: number; max: number; format?: (v: number) => string; onChange: (v: number) => void}) {
  const {S, p, f} = useTheme();
  const fmt = props.format || ((v: number) => String(v));
  const clamp = (v: number) => Math.max(props.min, Math.min(props.max, Math.round(v * 100) / 100));
  return (
    <View style={S.row}>
      <Button label="−" onPress={() => props.onChange(clamp(props.value - props.step))} />
      <Text style={{fontFamily: f.serif, fontSize: 19, minWidth: 84, textAlign: 'center', color: p.text, fontVariant: DATA_FIGURES}}>{fmt(props.value)}</Text>
      <Button label="+" onPress={() => props.onChange(clamp(props.value + props.step))} />
    </View>
  );
}

export default function SettingsScreen(props: {settings: Settings; onSave: (s: Settings) => void; onClose: () => void}) {
  const [s, setS] = useState<Settings>(props.settings);
  const {S, p, f} = useTheme();
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS(prev => ({...prev, [k]: v}));
  const sizeLabel = s.insertEm <= 48 ? 'small' : s.insertEm <= 64 ? 'medium' : s.insertEm <= 88 ? 'large' : 'x-large';

  return (
    <View style={S.fill}>
      <View style={S.bar}>
        <Button label="Cancel" onPress={props.onClose} />
        <Text style={S.barTitle}>Settings</Text>
        <Button label="Save" cta onPress={() => props.onSave(s)} />
      </View>
      <ScrollView style={{backgroundColor: p.bg}} contentContainerStyle={{padding: 16, paddingTop: 0, paddingBottom: 60}} overScrollMode="never">
        {!canWrite() ? (
          <View style={[S.banner, {borderWidth: 1, borderColor: p.warn, marginTop: 12}]}>
            <Text style={S.bannerText}>
              The native file module did not load, so settings cannot be stored and notes cannot be saved. Reinstall
              the plugin package (mathdown.snplg).
            </Text>
          </View>
        ) : null}

        <Section title="Page" />

        <Row
          title="Palette"
          hint="Istari Paper is the theme's own print palette: dark ink on white, made for paper, and so for e-ink. Istari Night is the screen palette: parchment on near-black.">
          <Segmented<'paper' | 'night'>
            value={s.theme}
            options={[
              {value: 'paper', label: 'Paper'},
              {value: 'night', label: 'Night'},
            ]}
            onChange={v => set('theme', v)}
          />
        </Row>

        <Row title="Inline title" hint="Show the file name above the note, as Obsidian does. New notes then start empty.">
          <OnOff value={s.inlineTitle} on="Shown" off="Hidden" onChange={v => set('inlineTitle', v)} />
        </Row>

        <Row title="Sidenotes" hint="Tap a footnote number to open the note in place, under its line (as the Istari Companion does). Off: footnotes are listed at the end.">
          <OnOff value={s.sidenotes} on="In place" off="At the end" onChange={v => set('sidenotes', v)} />
        </Row>

        <Row title="Editor face" hint="EB Garamond, as in Istari's editor, or JetBrains Mono, which aligns TeX by column.">
          <Segmented<'serif' | 'mono'>
            value={s.editorFont}
            options={[
              {value: 'serif', label: 'Garamond'},
              {value: 'mono', label: 'Mono'},
            ]}
            onChange={v => set('editorFont', v)}
          />
        </Row>

        <Section title="Notes" />

        <Row
          title="Vault folder"
          hint={'Your notes folder. To share notes with Obsidian, use the folder you open as the vault on your computer. [[Links]] and ![[embeds]] are found anywhere inside it. Default: ' + DEFAULT_VAULT}>
          <TextInput
            value={s.vaultDir}
            onChangeText={v => set('vaultDir', v.trim())}
            autoCapitalize="none"
            autoCorrect={false}
            style={[S.input, {fontFamily: f.mono, fontSize: 15}]}
          />
          <View style={[S.row, {marginTop: 6}]}>
            <Button small label="Use default" onPress={() => set('vaultDir', DEFAULT_VAULT)} />
          </View>
        </Row>

        <Row title="Auto-save" hint="Save a note that already has a file 2.5 s after you stop typing, and before you follow a link. Untitled notes still ask for a name.">
          <OnOff value={s.autoSave} on="On" off="Off (use Save)" onChange={v => set('autoSave', v)} />
        </Row>

        <Section title="Type and math" />

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
          <OnOff value={s.autoPreview} on="On" off="Off (use the Render button)" onChange={v => set('autoPreview', v)} />
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

        <Section title="Handwritten notes" />

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
            style={[S.input, {fontFamily: f.mono, fontSize: 15, minHeight: 120}]}
          />
        </Row>

        <View style={[S.row, {marginTop: 16}]}>
          <Button label="Reset all to defaults" onPress={() => setS({...DEFAULT_SETTINGS})} />
        </View>
        <Text style={[S.hint, {marginTop: 20, color: p.faint}]}>
          Mathdown 1.2 · Istari style (EB Garamond, Cormorant Garamond, JetBrains Mono) · MathJax 3 and a JavaScript
          rasterizer, fully offline{f.loaded ? '' : ' · Istari fonts did not load: system serif in use'}.
        </Text>
      </ScrollView>
    </View>
  );
}
