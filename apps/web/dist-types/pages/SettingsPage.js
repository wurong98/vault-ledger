import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { api, ApiError } from '../api.js';
export function SettingsPage({ status, onRefresh, }) {
    const [settings, setSettings] = useState(null);
    const [model, setModel] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [message, setMessage] = useState(null);
    const [error, setError] = useState(null);
    const [restoreFile, setRestoreFile] = useState(null);
    const [restorePassword, setRestorePassword] = useState('');
    const [planId, setPlanId] = useState(null);
    const [preview, setPreview] = useState(null);
    useEffect(() => {
        void (async () => {
            const result = await api.get('/settings/llm');
            setSettings(result);
            setModel(result.model);
        })();
    }, []);
    const saveLlm = async () => {
        setError(null);
        setMessage(null);
        try {
            const payload = { model };
            if (apiKey)
                payload.apiKey = apiKey;
            const result = await api.patch('/settings/llm', payload);
            setSettings(result);
            setApiKey('');
            setMessage('已保存');
            onRefresh();
        }
        catch (err) {
            setError(err instanceof ApiError ? err.message : '保存失败');
        }
    };
    const testLlm = async () => {
        setError(null);
        setMessage(null);
        try {
            await api.post('/settings/llm/test', {});
            setMessage('连接正常');
        }
        catch (err) {
            setError(err instanceof ApiError ? err.message : '连接失败');
        }
    };
    const downloadBackup = async () => {
        setError(null);
        setMessage(null);
        try {
            const result = await api.post('/backups', {});
            const link = document.createElement('a');
            link.href = `/api/v1/backups/${result.backupId}/download`;
            link.download = result.filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setMessage('已发起备份下载。请到手机文件管理器确认文件确实存在——网页无法证明下载结果。');
        }
        catch (err) {
            setError(err instanceof ApiError ? err.message : '生成备份失败');
        }
    };
    const previewRestore = async () => {
        setError(null);
        setMessage(null);
        if (!restoreFile) {
            setError('请选择备份文件');
            return;
        }
        const form = new FormData();
        form.append('password', restorePassword);
        form.append('file', restoreFile);
        try {
            const response = await fetch('/api/v1/restores/preview', {
                method: 'POST',
                body: form,
                credentials: 'same-origin',
            });
            const body = await response.json();
            if (!response.ok) {
                throw new ApiError(body.code ?? 'INTERNAL_ERROR', body.message ?? '恢复校验失败');
            }
            setPlanId(body.planId);
            setPreview(body.preview);
        }
        catch (err) {
            setError(err instanceof ApiError ? err.message : '恢复校验失败');
        }
    };
    const confirmRestore = async () => {
        if (!planId)
            return;
        setError(null);
        try {
            await api.post(`/restores/${planId}/confirm`, {});
            setMessage('恢复完成，请重新解锁');
            setTimeout(() => window.location.reload(), 800);
        }
        catch (err) {
            setError(err instanceof ApiError ? err.message : '恢复失败');
        }
    };
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "card", children: [_jsx("h2", { children: "\u6A21\u578B\u8BBE\u7F6E" }), _jsx("p", { className: "muted", children: "Key \u52A0\u5BC6\u4FDD\u5B58\u5728\u672C\u673A\uFF0C\u4E0D\u8FDB\u5165\u524D\u7AEF\u5305\u3002\u73AF\u5883\u53D8\u91CF\u63D0\u4F9B\u7684 Key \u4F18\u5148\u4E8E\u754C\u9762\u4FDD\u5B58\u503C\uFF0C\u4E14\u4E0D\u968F\u5907\u4EFD\u8FC1\u79FB\u3002" }), _jsx("label", { htmlFor: "model", children: "\u6A21\u578B\u540D\u79F0" }), _jsx("input", { id: "model", value: model, onChange: (e) => setModel(e.target.value) }), _jsx("label", { htmlFor: "apikey", children: "DeepSeek API Key\uFF08\u7559\u7A7A\u8868\u793A\u4E0D\u4FEE\u6539\uFF09" }), _jsx("input", { id: "apikey", type: "password", value: apiKey, autoComplete: "off", onChange: (e) => setApiKey(e.target.value) }), settings ? (_jsxs("p", { className: "muted", children: ["\u5F53\u524D\u6765\u6E90\uFF1A", settings.keySource === 'env'
                                ? '环境变量'
                                : settings.keySource === 'ui'
                                    ? `界面保存（${settings.keyMask ?? '已设置'}）`
                                    : '未配置'] })) : null, _jsxs("div", { className: "row", children: [_jsx("button", { className: "primary", onClick: () => void saveLlm(), children: "\u4FDD\u5B58" }), _jsx("button", { onClick: () => void testLlm(), children: "\u6D4B\u8BD5\u8FDE\u63A5" })] }), message ? _jsx("p", { className: "ok", children: message }) : null, error ? _jsx("p", { className: "error", children: error }) : null] }), _jsxs("div", { className: "card", children: [_jsx("h2", { children: "\u5907\u4EFD" }), _jsx("p", { className: "muted", children: "\u6BCF\u6B21\u70B9\u51FB\u90FD\u4F1A\u751F\u6210\u5F53\u65F6\u7684\u4E00\u4EFD\u5B8C\u6574\u52A0\u5BC6\u5FEB\u7167\uFF0C\u5305\u542B\u5168\u90E8\u8D26\u672C\u3001\u8BB0\u5F55\u3001\u622A\u56FE\u4E0E\u8BBE\u7F6E\u3002" }), _jsx("button", { onClick: () => void downloadBackup(), children: "\u4E0B\u8F7D\u52A0\u5BC6\u5907\u4EFD" })] }), _jsxs("div", { className: "card", children: [_jsx("h2", { children: "\u4ECE\u5907\u4EFD\u6062\u590D" }), _jsx("p", { className: "muted", children: "\u6062\u590D\u4F1A\u6574\u4F53\u66FF\u6362\u5F53\u524D\u6570\u636E\u7A7A\u95F4\uFF0C\u6062\u590D\u524D\u7684\u526F\u672C\u4F1A\u88AB\u4FDD\u7559\u3002" }), _jsx("label", { htmlFor: "restore-file", children: "\u5907\u4EFD\u6587\u4EF6" }), _jsx("input", { id: "restore-file", type: "file", accept: ".ledgerbox,application/zip", onChange: (e) => setRestoreFile(e.target.files?.[0] ?? null) }), _jsx("label", { htmlFor: "restore-password", children: "\u5907\u4EFD\u5BC6\u7801" }), _jsx("input", { id: "restore-password", type: "password", value: restorePassword, onChange: (e) => setRestorePassword(e.target.value) }), _jsxs("div", { className: "row", children: [_jsx("button", { onClick: () => void previewRestore(), children: "\u6821\u9A8C\u5907\u4EFD" }), planId ? (_jsx("button", { className: "danger", onClick: () => void confirmRestore(), children: "\u786E\u8BA4\u6062\u590D" })) : null] }), preview ? (_jsxs("p", { className: "muted", children: ["\u5907\u4EFD\u65F6\u95F4 ", preview.createdAt.slice(0, 16).replace('T', ' '), " \u00B7 ", preview.ledgerCount, ' ', "\u4E2A\u8D26\u672C \u00B7 ", preview.recordCount, " \u6761\u8BB0\u5F55 \u00B7 ", preview.blobCount, " \u5F20\u622A\u56FE"] })) : null] }), _jsxs("div", { className: "card", children: [_jsx("h2", { children: "\u4F1A\u8BDD" }), _jsxs("p", { className: "muted", children: ["\u7A7A\u95F2 ", status.public.sessionIdleMinutes, " \u5206\u949F\u540E\u81EA\u52A8\u9501\u5B9A\u3002"] }), _jsxs("div", { className: "row", children: [_jsx("button", { onClick: () => {
                                    void api.post('/lock', {}).then(() => window.location.reload());
                                }, children: "\u9501\u5B9A\u5F53\u524D\u8BBE\u5907" }), _jsx("button", { className: "danger", onClick: () => {
                                    void api.post('/lock-all', {}).then(() => window.location.reload());
                                }, children: "\u9501\u5B9A\u5168\u90E8\u8BBE\u5907" })] })] })] }));
}
//# sourceMappingURL=SettingsPage.js.map