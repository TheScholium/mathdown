/**
 * Notes folder browser: open, create, rename and delete Markdown files.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {FlatList, Pressable, Text, View} from 'react-native';
import {RattaFileSelector} from 'sn-plugin-lib';
import {
  FileEntry,
  basename,
  deleteFile,
  dirname,
  exists,
  listDir,
  loadRecent,
  mkdirs,
  renameFile,
  safeName,
} from './storage';
import {GRAY, INK, LIGHT, S} from './theme';
import {Button, Confirm, ConfirmSpec, Prompt} from './ui';

const MD_RE = /\.(md|markdown|txt)$/i;

function when(ms: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  const pad = (n: number) => (n < 10 ? '0' : '') + n;
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

export default function FileBrowser(props: {
  root: string;
  currentPath: string | null;
  onOpen: (path: string) => void;
  onNew: (path: string) => void;
  onClose: () => void;
  onRenamed: (from: string, to: string) => void;
  onDeleted: (path: string) => void;
  canWrite: boolean;
}) {
  const [dir, setDir] = useState(props.currentPath ? dirname(props.currentPath) : props.root);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<null | {kind: 'new' | 'folder' | 'rename'; target?: string}>(null);
  const [confirm, setConfirm] = useState<ConfirmSpec>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      if (!(await exists(dir))) {
        if (dir === props.root) await mkdirs(dir);
      }
      const list = await listDir(dir);
      const shown = list
        .filter(e => !e.name.startsWith('.') && (e.isDir || MD_RE.test(e.name)))
        .sort((a, b) => (a.isDir !== b.isDir ? (a.isDir ? -1 : 1) : b.modified - a.modified || a.name.localeCompare(b.name)));
      setEntries(shown);
    } catch (e: any) {
      setError(String(e && e.message ? e.message : e));
      setEntries([]);
    }
    try {
      setRecent((await loadRecent()).filter(p => p !== props.currentPath).slice(0, 5));
    } catch {
      setRecent([]);
    }
  }, [dir, props.root, props.currentPath]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const atRoot = dir === props.root || dir.length <= props.root.length;

  const browseDevice = async () => {
    try {
      const res = await RattaFileSelector.selectFile({
        selectType: 1,
        suffixList: ['md', 'markdown', 'txt'],
        maxNum: 1,
        title: 'Open a Markdown file',
      });
      if (res && res.length) props.onOpen(res[0]);
    } catch (e: any) {
      setError('File picker failed: ' + String(e && e.message ? e.message : e));
    }
  };

  const onPromptOk = async (value: string) => {
    const p = prompt;
    setPrompt(null);
    if (!p) return;
    try {
      if (p.kind === 'new') {
        const path = dir + '/' + safeName(value) + '.md';
        if (await exists(path)) {
          setError('A note with that name exists.');
          return;
        }
        props.onNew(path);
      } else if (p.kind === 'folder') {
        await mkdirs(dir + '/' + safeName(value));
        refresh();
      } else if (p.kind === 'rename' && p.target) {
        const ext = (/\.[^.]+$/.exec(p.target) || ['.md'])[0];
        const to = dirname(p.target) + '/' + safeName(value) + ext;
        if (to !== p.target) {
          await renameFile(p.target, to);
          props.onRenamed(p.target, to);
        }
        setSelected(null);
        refresh();
      }
    } catch (e: any) {
      setError(String(e && e.message ? e.message : e));
    }
  };

  const askDelete = (path: string) =>
    setConfirm({
      title: 'Delete "' + basename(path) + '"?',
      message: 'This cannot be undone.',
      buttons: [
        {label: 'Cancel', onPress: () => {}},
        {
          label: 'Delete',
          onPress: async () => {
            try {
              await deleteFile(path);
              props.onDeleted(path);
              setSelected(null);
              refresh();
            } catch (e: any) {
              setError(String(e && e.message ? e.message : e));
            }
          },
        },
      ],
    });

  return (
    <View style={S.fill}>
      <View style={S.bar}>
        <Button label="← Back" onPress={props.onClose} />
        <Text style={S.barTitle} numberOfLines={1}>
          {dir.replace('/storage/emulated/0/', '')}
        </Text>
        <Button label="New note" disabled={!props.canWrite} onPress={() => setPrompt({kind: 'new'})} />
        <Button label="New folder" disabled={!props.canWrite} onPress={() => setPrompt({kind: 'folder'})} />
      </View>
      <View style={[S.row, {padding: 6, borderBottomWidth: 1, borderColor: INK, flexWrap: 'wrap'}]}>
        <Button label="↑ Up" small disabled={atRoot} onPress={() => setDir(dirname(dir))} />
        <Button label="Notes folder" small onPress={() => setDir(props.root)} />
        <Button label="Browse device…" small onPress={browseDevice} />
        <Button label="Refresh" small onPress={refresh} />
        {selected ? (
          <>
            <View style={{width: 12}} />
            <Button label="Rename" small disabled={!props.canWrite} onPress={() => setPrompt({kind: 'rename', target: selected})} />
            <Button label="Delete" small disabled={!props.canWrite} onPress={() => askDelete(selected)} />
          </>
        ) : null}
      </View>
      {error ? (
        <View style={S.banner}>
          <Text style={S.bannerText}>{error}</Text>
        </View>
      ) : null}
      {recent.length && atRoot ? (
        <View style={{paddingHorizontal: 12, paddingTop: 8}}>
          <Text style={S.hint}>Recent</Text>
          {recent.map(p => (
            <Pressable key={p} onPress={() => props.onOpen(p)} style={{paddingVertical: 6}}>
              <Text style={{fontSize: 16, color: INK}} numberOfLines={1}>
                {basename(p)} <Text style={S.hint}>— {dirname(p).replace('/storage/emulated/0/', '')}</Text>
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <FlatList
        data={entries}
        keyExtractor={e => e.path}
        style={{flex: 1}}
        overScrollMode="never"
        ListEmptyComponent={
          <Text style={[S.hint, {padding: 16}]}>{error ? '' : 'No Markdown notes here yet. Tap "New note".'}</Text>
        }
        renderItem={({item}) => {
          const isSel = selected === item.path;
          const isCur = props.currentPath === item.path;
          return (
            <Pressable
              onPress={() => (item.isDir ? setDir(item.path) : props.onOpen(item.path))}
              onLongPress={() => (item.isDir ? null : setSelected(isSel ? null : item.path))}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderColor: LIGHT,
                borderLeftWidth: isSel ? 6 : 0,
                borderLeftColor: INK,
              }}>
              <Text style={{fontSize: 18, width: 30, color: INK}}>{item.isDir ? '▸' : '≡'}</Text>
              <View style={{flex: 1}}>
                <Text style={{fontSize: 18, color: INK, fontWeight: isCur ? '700' : '400'}} numberOfLines={1}>
                  {item.name}
                </Text>
                {!item.isDir ? (
                  <Text style={{fontSize: 13, color: GRAY}}>
                    {when(item.modified)}
                    {item.size ? '  ·  ' + Math.max(1, Math.round(item.size / 1024)) + ' KB' : ''}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        }}
      />
      <Text style={[S.hint, {padding: 10, borderTopWidth: 1, borderColor: INK}]}>
        Tap a note to open it. Long-press a note to rename or delete it.
      </Text>
      <Prompt
        visible={!!prompt}
        title={prompt?.kind === 'folder' ? 'New folder' : prompt?.kind === 'rename' ? 'Rename note' : 'New note'}
        message={prompt?.kind === 'new' ? 'File name (".md" is added).' : undefined}
        initial={prompt?.kind === 'rename' && prompt.target ? basename(prompt.target).replace(MD_RE, '') : ''}
        okLabel={prompt?.kind === 'rename' ? 'Rename' : 'Create'}
        onOk={onPromptOk}
        onCancel={() => setPrompt(null)}
      />
      <Confirm spec={confirm} onClose={() => setConfirm(null)} />
    </View>
  );
}
