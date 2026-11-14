import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, ApiError } from '../api.js';
const TYPE_LABELS = {
    expense: '支出',
    income: '收入',
    transfer: '转账',
    lend: '借出',
    borrow: '借入',
    repayment_received: '收回',
    repayment_paid: '归还',
};
export function RecordPage({ ledger }) {
    const { id } = useParams();
    const [record, setRecord] = useState(null);
    const [history, setHistory] = useState(null);
    const [amount, setAmount] = useState('');
    const [occurredOn, setOccurredOn] = useState('');
    const [remark, setRemark] = useState('');
    const [imageUrl, setImageUrl] = useState(null);
    const [message, setMessage] = useState(null);
    const [error, setError] = useState(null);
    useEffect(() => {
        if (!id)
            return;
        void (async () => {
            const result = await api.get(`/records/${id}`);
            setRecord(result.record);
            setAmount(result.record.amount);
            setOccurredOn(result.record.occurredOn);
            setRemark(result.record.remark ?? '');
            const h = await api.get(`/records/${id}/history`);
            setHistory(h);
            if (result.record.sourceId) {
                const response = await fetch(`/api/v1/sources/${result.record.sourceId}/image`, {
                    credentials: 'same-origin',
                });
                if (response.ok) {
                    const blob = await response.blob();
                    setImageUrl(URL.createObjectURL(blob));
                }
            }
        })();
    }, [id]);
    if (!ledger)
        return _jsx("div", { className: "card", children: "\u6B63\u5728\u52A0\u8F7D\u8D26\u672C\u2026" });
    if (!record)
        return _jsx("div", { className: "card", children: "\u6B63\u5728\u52A0\u8F7D\u8BB0\u5F55\u2026" });
    const save = async () => {
        setError(null);
        setMessage(null);
        try {
            const result = await api.patch(`/records/${record.id}`, {
                expectedRevision: record.revision,
                amount,
                occurredOn,
                remark: remark || null,
                reason: '页面修改',
            });
            setRecord(result.record);
            setMessage('已保存，旧版本保留在历史中');
            const h = await api.get(`/records/${record.id}/history`);
            setHistory(h);
        }
        catch (err) {
            setError(err instanceof ApiError ? err.message : '保存失败');
        }
    };
    const voidRecord = async () => {
        setError(null);
        try {
            const result = await api.post(`/records/${record.id}/void`, { expectedRevision: record.revision });
            setRecord(result.record);
            setMessage('已作废，历史与来源保留');
        }
        catch (err) {
            setError(err instanceof ApiError ? err.message : '作废失败');
        }
    };
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "card", children: [_jsxs("h2", { children: [TYPE_LABELS[record.type] ?? record.type, " \u00A5", record.amount] }), _jsxs("p", { className: "muted", children: [record.occurredOn, " \u00B7 \u7B2C ", record.revision, " \u7248 \u00B7", ' ', record.status === 'voided' ? '已作废' : '有效'] }), imageUrl ? (_jsx("a", { href: imageUrl, target: "_blank", rel: "noreferrer", children: _jsx("img", { className: "preview", src: imageUrl, alt: "\u539F\u59CB\u622A\u56FE" }) })) : (_jsx("p", { className: "muted", children: "\u8FD9\u6761\u8BB0\u5F55\u6CA1\u6709\u5173\u8054\u622A\u56FE" }))] }), _jsxs("div", { className: "card", children: [_jsx("h2", { children: "\u4FEE\u6539" }), _jsx("label", { htmlFor: "edit-amount", children: "\u91D1\u989D" }), _jsx("input", { id: "edit-amount", inputMode: "decimal", value: amount, onChange: (e) => setAmount(e.target.value) }), _jsx("label", { htmlFor: "edit-date", children: "\u65E5\u671F" }), _jsx("input", { id: "edit-date", type: "date", value: occurredOn, onChange: (e) => setOccurredOn(e.target.value) }), _jsx("label", { htmlFor: "edit-remark", children: "\u5907\u6CE8" }), _jsx("input", { id: "edit-remark", value: remark, onChange: (e) => setRemark(e.target.value) }), _jsxs("div", { className: "row", children: [_jsx("button", { className: "primary", onClick: () => void save(), children: "\u4FDD\u5B58\u4FEE\u6539" }), record.status === 'active' ? (_jsx("button", { className: "danger", onClick: () => void voidRecord(), children: "\u4F5C\u5E9F" })) : null] }), message ? _jsx("p", { className: "ok", children: message }) : null, error ? _jsx("p", { className: "error", children: error }) : null] }), _jsxs("div", { className: "card", children: [_jsx("h2", { children: "\u4FEE\u6539\u5386\u53F2" }), history && history.revisions.length > 0 ? (history.revisions.map((revision) => (_jsxs("div", { className: "list-item", children: [_jsxs("span", { children: ["\u7B2C ", revision.previousRevision, " \u7248 \u2192 \u7B2C ", revision.previousRevision + 1, " \u7248\uFF1A", revision.correctedFields.join('、')] }), _jsx("span", { className: "muted", children: revision.createdAt.slice(0, 16).replace('T', ' ') })] }, revision.id)))) : (_jsx("p", { className: "muted", children: "\u8FD8\u6CA1\u6709\u4FEE\u6539\u8FC7" }))] })] }));
}
//# sourceMappingURL=RecordPage.js.map