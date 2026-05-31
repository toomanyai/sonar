"use client";

import { useEffect, useState } from "react";
import { ChevronUp, ChevronDown, Plus, CheckCircle2, XCircle } from "lucide-react";
import {
  getLLMSettings,
  saveLLMSettings,
  testLLMProvider,
  type LLMSettings,
} from "@/lib/api";
import { Card, CardHeader, PageTitle, LoadingState } from "@/components/Primitives";
import { cn } from "@/lib/ui";

interface Row {
  id: string;
  label: string;
  base_url: string;
  model: string;
  api_key: string; // 空=保留
  key_hint: string;
  has_key: boolean;
  enabled: boolean;
  builtin: boolean;
}

export default function SettingsPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState<Record<string, string>>({});

  useEffect(() => {
    getLLMSettings().then((s: LLMSettings) => {
      const ids = Array.from(
        new Set([...s.chain, ...Object.keys(s.providers)])
      );
      setRows(
        ids.map((id) => {
          const p = s.providers[id] ?? {
            label: id, base_url: "", model: "", has_key: false, key_hint: "", builtin: false,
          };
          return {
            id, label: p.label, base_url: p.base_url, model: p.model,
            api_key: "", key_hint: p.key_hint, has_key: p.has_key,
            enabled: s.chain.includes(id), builtin: p.builtin,
          };
        })
      );
    });
  }, []);

  if (!rows) return <LoadingState />;

  const update = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs!.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const copy = [...rows];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    setRows(copy);
  };
  const addCustom = () => {
    const id = `custom${Date.now().toString().slice(-4)}`;
    setRows([...rows, {
      id, label: "自定义供应商", base_url: "", model: "", api_key: "",
      key_hint: "", has_key: false, enabled: true, builtin: false,
    }]);
  };

  const onSave = async () => {
    const chain = rows.filter((r) => r.enabled).map((r) => r.id);
    const providers: Record<string, { label: string; base_url: string; model: string; api_key: string }> = {};
    rows.forEach((r) => {
      providers[r.id] = { label: r.label, base_url: r.base_url, model: r.model, api_key: r.api_key };
    });
    await saveLLMSettings(chain, providers);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const onTest = async (r: Row) => {
    setTesting((t) => ({ ...t, [r.id]: "测试中…" }));
    const res = await testLLMProvider(
      r.api_key
        ? { base_url: r.base_url, api_key: r.api_key, model: r.model }
        : { provider_id: r.id, base_url: r.base_url, model: r.model }
    );
    setTesting((t) => ({
      ...t,
      [r.id]: res.ok ? `✓ 连通 (${res.model})` : `✗ ${res.error}`,
    }));
  };

  return (
    <div className="max-w-3xl space-y-6">
      <PageTitle title="设置" subtitle="配置 LLM API key、模型与回退链。任何 OpenAI 兼容服务都可接入。" />

      <Card>
        <CardHeader
          title="LLM 供应商 / 回退链"
          subtitle="从上到下为调用优先级（前一个失败自动用下一个）。勾选「启用」才进入回退链。"
        />
        <div className="space-y-3 p-5">
          {rows.map((r, i) => (
            <div key={r.id} className="rounded-xl border border-slate-200 p-4">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex flex-col">
                  <button onClick={() => move(i, -1)} disabled={i === 0}
                    className="text-slate-300 hover:text-slate-600 disabled:opacity-30">
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button onClick={() => move(i, 1)} disabled={i === rows.length - 1}
                    className="text-slate-300 hover:text-slate-600 disabled:opacity-30">
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
                <input
                  value={r.label}
                  onChange={(e) => update(i, { label: e.target.value })}
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-[14px] font-medium outline-none focus:border-blue-400"
                />
                <label className="flex items-center gap-1.5 text-[13px] text-slate-600">
                  <input type="checkbox" checked={r.enabled}
                    onChange={(e) => update(i, { enabled: e.target.checked })} />
                  启用
                </label>
                <span className="text-[11px] text-slate-300">#{i + 1}</span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Field label="Base URL" value={r.base_url}
                  onChange={(v) => update(i, { base_url: v })} placeholder="https://api.xxx.com/v1" />
                <Field label="Model" value={r.model}
                  onChange={(v) => update(i, { model: v })} placeholder="如 gpt-4o-mini" />
                <Field label="API Key" value={r.api_key} password
                  onChange={(v) => update(i, { api_key: v })}
                  placeholder={r.has_key ? `已设置 ${r.key_hint}，留空不变` : "粘贴 API key"} />
                <div className="flex items-end gap-2">
                  <button onClick={() => onTest(r)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-50">
                    测试
                  </button>
                  {testing[r.id] && (
                    <span className={cn("text-[12px]",
                      testing[r.id].startsWith("✓") ? "text-emerald-600"
                        : testing[r.id].startsWith("✗") ? "text-red-500" : "text-slate-400")}>
                      {testing[r.id]}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
          <button onClick={addCustom}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 py-3 text-[13px] text-slate-500 hover:border-blue-300 hover:text-blue-600">
            <Plus className="h-4 w-4" /> 添加自定义供应商（任意 OpenAI 兼容服务）
          </button>
        </div>
        <div className="flex items-center gap-3 border-t border-slate-100 px-5 py-4">
          <button onClick={onSave}
            className="rounded-lg bg-blue-600 px-5 py-2 text-[14px] font-medium text-white hover:bg-blue-700">
            保存
          </button>
          {saved && (
            <span className="flex items-center gap-1 text-[13px] text-emerald-600">
              <CheckCircle2 className="h-4 w-4" /> 已保存（下次分析即生效）
            </span>
          )}
        </div>
      </Card>

      <p className="px-1 text-[12px] leading-relaxed text-slate-400">
        密钥保存在本机后端的 <code>backend/llm_config.json</code>（已 gitignore，不会上传）。
        留空 API Key 表示沿用已存的。回退链为空时自动回退到 <code>.env</code> 配置。
      </p>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, password }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; password?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-slate-400">{label}</span>
      <input
        type={password ? "password" : "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-blue-400 placeholder:text-slate-300"
      />
    </label>
  );
}
