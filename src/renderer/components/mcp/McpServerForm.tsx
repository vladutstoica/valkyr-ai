import React, { useState, useCallback } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Textarea } from '../ui/textarea';
import { Plus, X } from 'lucide-react';
import type { McpServerConfig, McpServerInput, McpServerTransport } from '@shared/mcp/types';

interface Props {
  initialValues?: McpServerConfig;
  onSubmit: (server: McpServerInput) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

interface KeyValue {
  key: string;
  value: string;
}

function recordToKv(record: Record<string, string>): KeyValue[] {
  const entries = Object.entries(record).map(([key, value]) => ({ key, value }));
  return entries.length > 0 ? entries : [];
}

function kvToRecord(kv: KeyValue[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (const { key, value } of kv) {
    if (key.trim()) record[key.trim()] = value;
  }
  return record;
}

const KeyValueEditor: React.FC<{
  label: string;
  values: KeyValue[];
  onChange: (values: KeyValue[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}> = ({ label, values, onChange, keyPlaceholder = 'Key', valuePlaceholder = 'Value' }) => {
  const addRow = () => onChange([...values, { key: '', value: '' }]);
  const removeRow = (idx: number) => onChange(values.filter((_, i) => i !== idx));
  const updateRow = (idx: number, field: 'key' | 'value', val: string) => {
    const updated = [...values];
    updated[idx] = { ...updated[idx], [field]: val };
    onChange(updated);
  };

  return (
    <div className="flex flex-col gap-2">
      <Label className="text-xs">{label}</Label>
      {values.map((kv, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <Input
            value={kv.key}
            onChange={(e) => updateRow(idx, 'key', e.target.value)}
            placeholder={keyPlaceholder}
            className="h-8 flex-1 text-xs"
          />
          <Input
            value={kv.value}
            onChange={(e) => updateRow(idx, 'value', e.target.value)}
            placeholder={valuePlaceholder}
            className="h-8 flex-1 text-xs"
          />
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeRow(idx)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="link" size="sm" className="w-fit p-0 text-xs" onClick={addRow}>
        <Plus className="mr-1 h-3 w-3" />
        Add
      </Button>
    </div>
  );
};

export const McpServerForm: React.FC<Props> = ({
  initialValues,
  onSubmit,
  onCancel,
  isSubmitting,
}) => {
  const [name, setName] = useState(initialValues?.name ?? '');
  const [transport, setTransport] = useState<McpServerTransport>(
    initialValues?.transport ?? 'stdio'
  );
  const [enabled] = useState(initialValues?.enabled ?? true);

  // stdio fields
  const [command, setCommand] = useState(
    initialValues?.transport === 'stdio' ? initialValues.command : ''
  );
  const [argsText, setArgsText] = useState(
    initialValues?.transport === 'stdio' ? initialValues.args.join('\n') : ''
  );
  const [envKv, setEnvKv] = useState<KeyValue[]>(
    initialValues?.transport === 'stdio' ? recordToKv(initialValues.env) : []
  );

  // http/sse fields
  const [url, setUrl] = useState(
    initialValues?.transport === 'http' || initialValues?.transport === 'sse'
      ? initialValues.url
      : ''
  );
  const [headersKv, setHeadersKv] = useState<KeyValue[]>(
    initialValues?.transport === 'http' || initialValues?.transport === 'sse'
      ? recordToKv(initialValues.headers)
      : []
  );

  const handleTransportChange = useCallback((value: string) => {
    setTransport(value as McpServerTransport);
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim()) return;

      if (transport === 'stdio') {
        if (!command.trim()) return;
        onSubmit({
          name: name.trim(),
          transport: 'stdio',
          enabled,
          command: command.trim(),
          args: argsText
            .split('\n')
            .map((a) => a.trim())
            .filter(Boolean),
          env: kvToRecord(envKv),
        });
      } else {
        if (!url.trim()) return;
        onSubmit({
          name: name.trim(),
          transport,
          enabled,
          url: url.trim(),
          headers: kvToRecord(headersKv),
        });
      }
    },
    [name, transport, enabled, command, argsText, envKv, url, headersKv, onSubmit]
  );

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="mcp-name" className="text-xs">
          Name
        </Label>
        <Input
          id="mcp-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. playwright, github, context7"
          className="h-8 text-xs"
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="mcp-transport" className="text-xs">
          Transport
        </Label>
        <Select value={transport} onValueChange={handleTransportChange}>
          <SelectTrigger id="mcp-transport" className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="stdio">stdio (local command)</SelectItem>
            <SelectItem value="http">HTTP (remote)</SelectItem>
            <SelectItem value="sse">SSE (remote, legacy)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {transport === 'stdio' ? (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mcp-command" className="text-xs">
              Command
            </Label>
            <Input
              id="mcp-command"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="e.g. npx, node, python"
              className="h-8 text-xs"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mcp-args" className="text-xs">
              Arguments (one per line)
            </Label>
            <Textarea
              id="mcp-args"
              value={argsText}
              onChange={(e) => setArgsText(e.target.value)}
              placeholder={'-y\n@playwright/mcp@latest'}
              className="min-h-[80px] resize-y font-mono text-xs"
              rows={3}
            />
          </div>

          <KeyValueEditor
            label="Environment Variables"
            values={envKv}
            onChange={setEnvKv}
            keyPlaceholder="VAR_NAME"
            valuePlaceholder="value"
          />
        </>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mcp-url" className="text-xs">
              URL
            </Label>
            <Input
              id="mcp-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://mcp.example.com/mcp"
              className="h-8 text-xs"
              required
            />
          </div>

          <KeyValueEditor
            label="Headers"
            values={headersKv}
            onChange={setHeadersKv}
            keyPlaceholder="Header-Name"
            valuePlaceholder="header-value"
          />
        </>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : initialValues ? 'Save Changes' : 'Add Server'}
        </Button>
      </div>
    </form>
  );
};
