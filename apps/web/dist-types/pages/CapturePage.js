import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { api, ApiError, newIdempotencyKey } from '../api.js';
const TYPES = [
    ['expense', '支出'],
    ['income', '收入'],
    ['transfer', '转账'],
    ['lend', '借出'],
    ['borrow', '借入'],
    ['repayment_received', '收回'],
    ['repayment_paid', '归还'],
];
export function CapturePage({ ledger }) {
    const [accounts, setAccounts] = useState([]);
    const [contacts, setContacts] = useState([]);
    const [file, setFile] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [note, setNote] = useState('');
    const [sourceId, setSourceId] = useState(null);
    const [extraction, setExtraction] = useState(null);
    const [form, setForm] = useState({
        type: 'expense',
        amount: '',
        occurredOn: '',
        accountId: '',
        contactId: '',
        paymentMethod: '',
        remark: '',
    });
    const [message, setMessage] = useState(null);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        if (!ledger)
            return;
        void (async () => {
            const [a, c] = await Promise.all([
                api.get(`/ledgers/${ledger.id}/accounts`),
                api.get(`/ledgers/${ledger.id}/contacts`),
            ]);
            setAccounts(a.accounts);
            setContacts(c.contacts);
        })();
    }, [ledger]);
    useEffect(() => {
        if (!file) {
            setPreviewUrl(null);
            return;
        }
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [file]);
    const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
    if (!ledger)
        return _jsx("div", { className: "card", children: "\u6B63\u5728\u52A0\u8F7D\u8D26\u672C\u2026" });
    const upload = async () => {
        if (!file) {
            setError('请先选择截图');
            return;
        }
        setBusy(true);
        setError(null);
        setMessage(null);
        try {
            const result = await api.upload(`/ledgers/${ledger.id}/sources?note=${encodeURIComponent(note)}`, file);
            setSourceId(result.source.id);
            setMessage(result.reused ? '已复用相同内容的来源' : '已加密保存截图');
        }
        catch (err) {
            setError(err instanceof ApiError ? err.message : '上传失败');
        }
        finally {
            setBusy(false);
        }
    };
    const recognize = async () => {
        if (!sourceId) {
            setError('请先上传截图');
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const result = await api.post(`/sources/${sourceId}/extractions`, { ledgerId: ledger.id });
            setExtraction(result.extraction);
            const candidate = result.extraction.candidate;
            const account = accounts.find((a) => a.name === candidate.accountHint);
            const contact = contacts.find((c) => c.displayName === candidate.contactName);
            setForm({
                type: candidate.type,
                amount: candidate.amount,
                occurredOn: candidate.occurredOn ?? '',
                accountId: account?.id ?? accounts[0]?.id ?? '',
                contactId: contact?.id ?? '',
                paymentMethod: candidate.paymentMethod ?? '',
                remark: candidate.remark ?? '',
            });
            setMessage('识别完成，请核对后确认');
        }
        catch (err) {
            setError(err instanceof ApiError ? err.message : '识别失败');
        }
        finally {
            setBusy(false);
        }
    };
    const confirm = async () => {
        if (!extraction || !sourceId)
            return;
        setBusy(true);
        setError(null);
        try {
            await api.post(`/extractions/${extraction.id}/confirm`, {
                ledgerId: ledger.id,
                sourceId,
                record: {
                    type: form.type,
                    amount: form.amount,
                    currency: 'CNY',
                    occurredOn: form.occurredOn || today,
                    accountId: form.accountId,
                    counterAccountId: null,
                    contactId: form.contactId || null,
                    paymentMethod: form.paymentMethod || null,
                    merchant: null,
                    category: null,
                    remark: form.remark || null,
                },
            }, { 'Idempotency-Key': newIdempotencyKey() });
            setMessage('已保存到本机；尚未下载最新备份');
            setExtraction(null);
            setSourceId(null);
            setFile(null);
            setNote('');
        }
        catch (err) {
            setError(err instanceof ApiError ? err.message : '保存失败');
        }
        finally {
            setBusy(false);
        }
    };
    const manual = async () => {
        setBusy(true);
        setError(null);
        try {
            await api.post(`/ledgers/${ledger.id}/records`, {
                type: form.type,
                amount: form.amount,
                currency: 'CNY',
                occurredOn: form.occurredOn || today,
                accountId: form.accountId,
                counterAccountId: null,
                contactId: form.contactId || null,
                paymentMethod: form.paymentMethod || null,
                merchant: null,
                category: null,
                remark: form.remark || null,
                sourceId: null,
            }, { 'Idempotency-Key': newIdempotencyKey() });
            setMessage('已保存手动记录');
            setForm({ ...form, amount: '', remark: '' });
        }
        catch (err) {
            setError(err instanceof ApiError ? err.message : '保存失败');
        }
        finally {
            setBusy(false);
        }
    };
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "card", children: [_jsx("h2", { children: "\u622A\u56FE\u5F55\u5165" }), _jsx("p", { className: "muted", children: "\u622A\u56FE\u548C\u8BF4\u660E\u4F1A\u53D1\u9001\u7ED9\u4F60\u914D\u7F6E\u7684\u6A21\u578B\u670D\u52A1\u505A\u8BC6\u522B\uFF1B\u8BC6\u522B\u7ED3\u679C\u9700\u8981\u4F60\u786E\u8BA4\u540E\u624D\u4F1A\u8BA1\u5165\u8D26\u672C\u3002" }), _jsx("label", { htmlFor: "file", children: "\u9009\u62E9\u622A\u56FE" }), _jsx("input", { id: "file", type: "file", accept: "image/png,image/jpeg,image/webp", onChange: (e) => setFile(e.target.files?.[0] ?? null) }), previewUrl ? (_jsx("img", { className: "preview", src: previewUrl, alt: "\u622A\u56FE\u9884\u89C8" })) : null, _jsx("label", { htmlFor: "note", children: "\u8BF4\u660E\uFF08\u4F8B\u5982\uFF1A\u5FAE\u4FE1\u501F\u7ED9\u5F20\u4E09 500\uFF0C\u6708\u5E95\u8FD8\uFF09" }), _jsx("textarea", { id: "note", value: note, onChange: (e) => setNote(e.target.value), placeholder: "\u7528\u4E00\u53E5\u8BDD\u8BF4\u660E\u8FD9\u7B14\u662F\u4EC0\u4E48" }), _jsxs("div", { className: "row", children: [_jsx("button", { onClick: () => void upload(), disabled: busy, children: "\u4E0A\u4F20\u5E76\u52A0\u5BC6\u4FDD\u5B58" }), _jsx("button", { onClick: () => void recognize(), disabled: busy || !sourceId, children: "\u8BC6\u522B" })] }), message ? _jsx("p", { className: "ok", children: message }) : null, error ? _jsx("p", { className: "error", children: error }) : null] }), _jsxs("div", { className: "card", children: [_jsx("h2", { children: extraction ? '核对候选并确认' : '手动录入' }), extraction && extraction.requiresReview.length > 0 ? (_jsxs("p", { className: "muted", children: ["\u5F85\u786E\u8BA4\u5B57\u6BB5\uFF1A", extraction.requiresReview.join('、')] })) : null, _jsx("label", { htmlFor: "type", children: "\u7C7B\u578B" }), _jsx("select", { id: "type", value: form.type, onChange: (e) => setForm({ ...form, type: e.target.value }), children: TYPES.map(([value, label]) => (_jsx("option", { value: value, children: label }, value))) }), _jsx("label", { htmlFor: "amount", children: "\u91D1\u989D" }), _jsx("input", { id: "amount", inputMode: "decimal", value: form.amount, onChange: (e) => setForm({ ...form, amount: e.target.value }) }), _jsx("label", { htmlFor: "occurredOn", children: "\u65E5\u671F" }), _jsx("input", { id: "occurredOn", type: "date", value: form.occurredOn, onChange: (e) => setForm({ ...form, occurredOn: e.target.value }) }), _jsx("label", { htmlFor: "account", children: "\u8D26\u6237" }), _jsxs("select", { id: "account", value: form.accountId, onChange: (e) => setForm({ ...form, accountId: e.target.value }), children: [_jsx("option", { value: "", children: "\u672A\u9009\u62E9" }), accounts.map((account) => (_jsx("option", { value: account.id, children: account.name }, account.id)))] }), _jsx("label", { htmlFor: "contact", children: "\u5BF9\u65B9\uFF08\u501F\u8FD8\u6B3E\u5FC5\u586B\uFF09" }), _jsxs("select", { id: "contact", value: form.contactId, onChange: (e) => setForm({ ...form, contactId: e.target.value }), children: [_jsx("option", { value: "", children: "\u65E0" }), contacts.map((contact) => (_jsx("option", { value: contact.id, children: contact.displayName }, contact.id)))] }), _jsx("label", { htmlFor: "paymentMethod", children: "\u652F\u4ED8\u65B9\u5F0F" }), _jsx("input", { id: "paymentMethod", value: form.paymentMethod, onChange: (e) => setForm({ ...form, paymentMethod: e.target.value }) }), _jsx("label", { htmlFor: "remark", children: "\u5907\u6CE8" }), _jsx("input", { id: "remark", value: form.remark, onChange: (e) => setForm({ ...form, remark: e.target.value }) }), _jsx("div", { className: "row", children: extraction ? (_jsx("button", { className: "primary", onClick: () => void confirm(), disabled: busy, children: "\u786E\u8BA4\u5E76\u4FDD\u5B58" })) : (_jsx("button", { className: "primary", onClick: () => void manual(), disabled: busy, children: "\u4FDD\u5B58\u624B\u52A8\u8BB0\u5F55" })) })] })] }));
}
//# sourceMappingURL=CapturePage.js.map