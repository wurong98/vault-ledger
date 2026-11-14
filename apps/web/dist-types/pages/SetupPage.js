import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { api, ApiError } from '../api.js';
export function SetupPage({ onDone }) {
    const [password, setPassword] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const [ledgerName, setLedgerName] = useState('个人');
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const submit = async () => {
        setBusy(true);
        setError(null);
        try {
            await api.post('/setup', { password, passwordConfirmation: confirmation, ledgerName });
            onDone();
        }
        catch (err) {
            setError(err instanceof ApiError ? err.message : '初始化失败');
        }
        finally {
            setBusy(false);
        }
    };
    return (_jsxs("div", { className: "card", children: [_jsx("h2", { children: "\u9996\u6B21\u8BBE\u7F6E" }), _jsx("p", { className: "muted", children: "\u8BBE\u7F6E\u89E3\u9501\u5BC6\u7801\u5E76\u521B\u5EFA\u7B2C\u4E00\u4E2A\u8D26\u672C\u3002\u5BC6\u7801\u4E0D\u4E0A\u4F20\u4EFB\u4F55\u670D\u52A1\u5668\uFF08\u5305\u62EC\u6A21\u578B\u670D\u52A1\uFF09\uFF0C\u672C\u9879\u76EE\u4E0D\u63D0\u4F9B\u5BC6\u7801\u627E\u56DE\u3002" }), _jsx("label", { htmlFor: "password", children: "\u5BC6\u7801\uFF08\u81F3\u5C11 12 \u4E2A\u5B57\u7B26\uFF09" }), _jsx("input", { id: "password", type: "password", value: password, autoComplete: "new-password", onChange: (e) => setPassword(e.target.value) }), _jsx("label", { htmlFor: "confirmation", children: "\u786E\u8BA4\u5BC6\u7801" }), _jsx("input", { id: "confirmation", type: "password", value: confirmation, autoComplete: "new-password", onChange: (e) => setConfirmation(e.target.value) }), _jsx("label", { htmlFor: "ledgerName", children: "\u8D26\u672C\u540D\u79F0" }), _jsx("input", { id: "ledgerName", value: ledgerName, onChange: (e) => setLedgerName(e.target.value) }), error ? _jsx("p", { className: "error", children: error }) : null, _jsx("button", { className: "primary", onClick: () => void submit(), disabled: busy, children: busy ? '正在初始化…' : '创建账本并加密数据空间' }), _jsx("p", { className: "muted", style: { marginTop: 12 }, children: "\u4E5F\u53EF\u4EE5\u5148\u4ECE\u5907\u4EFD\u6062\u590D\uFF1A\u5728\u8BBE\u7F6E\u9875\u9009\u62E9\u5907\u4EFD\u6587\u4EF6\u3002" })] }));
}
//# sourceMappingURL=SetupPage.js.map