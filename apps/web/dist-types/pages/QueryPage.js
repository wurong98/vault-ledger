import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api.js';
export function QueryPage({ ledger }) {
    const [question, setQuestion] = useState('');
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    if (!ledger)
        return _jsx("div", { className: "card", children: "\u6B63\u5728\u52A0\u8F7D\u8D26\u672C\u2026" });
    const ask = async () => {
        setBusy(true);
        setError(null);
        try {
            const response = await api.post(`/ledgers/${ledger.id}/query`, {
                question,
            });
            setResult(response);
        }
        catch (err) {
            setError(err instanceof ApiError ? err.message : '查询失败');
        }
        finally {
            setBusy(false);
        }
    };
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "card", children: [_jsx("h2", { children: "\u81EA\u7136\u8BED\u8A00\u67E5\u8BE2" }), _jsx("p", { className: "muted", children: "\u95EE\u9898\u4E0E\u5FC5\u8981\u7684\u5B57\u6BB5\u8BCD\u5178\u4F1A\u53D1\u9001\u5230\u6A21\u578B\u670D\u52A1\uFF0C\u91D1\u989D\u7531\u672C\u673A\u6309\u5B9E\u9645\u8BB0\u5F55\u8BA1\u7B97\u3002" }), _jsx("input", { value: question, onChange: (e) => setQuestion(e.target.value), placeholder: "\u4F8B\u5982\uFF1A\u672C\u6708\u9910\u996E\u82B1\u4E86\u591A\u5C11 / \u5F20\u4E09\u8FD8\u6B20\u6211\u591A\u5C11" }), _jsx("button", { className: "primary", onClick: () => void ask(), disabled: busy, children: busy ? '查询中…' : '查询' }), error ? _jsx("p", { className: "error", children: error }) : null] }), result ? (_jsxs("div", { className: "card", children: [_jsx("h2", { children: "\u7ED3\u679C" }), _jsx("p", { className: "muted", children: result.message }), _jsxs("p", { className: "muted", children: ["\u5B9E\u9645\u5E94\u7528\u7684\u7B5B\u9009\u6761\u4EF6\uFF1A", Object.entries(result.appliedFilters)
                                .filter(([, value]) => value)
                                .map(([key, value]) => `${key}=${value}`)
                                .join('，') || '无'] }), result.total ? (_jsxs("p", { className: "amount", children: ["\u5408\u8BA1 \u00A5", result.total] })) : null, result.breakdown.length > 0 ? (_jsx(_Fragment, { children: result.breakdown.map((item) => (_jsxs("div", { className: "list-item", children: [_jsxs("span", { children: [item.label, "\uFF08", item.count, " \u7B14\uFF09"] }), _jsxs("span", { className: "amount", children: ["\u00A5", item.amount] })] }, item.key))) })) : null, result.debts.length > 0 ? (_jsx(_Fragment, { children: result.debts.map((debt) => (_jsxs("div", { className: "list-item", children: [_jsx("span", { children: debt.contactName }), _jsxs("span", { className: "amount", children: ["\u5E94\u6536 \u00A5", debt.receivable, " / \u5E94\u4ED8 \u00A5", debt.payable] })] }, debt.contactId))) })) : null, result.records.length > 0 ? (_jsx(_Fragment, { children: result.records.map((record) => (_jsxs(Link, { className: "list-item", to: `/records/${record.id}`, children: [_jsxs("span", { children: [record.occurredOn, " \u00B7 ", record.type] }), _jsxs("span", { className: "amount", children: ["\u00A5", record.amount] })] }, record.id))) })) : null] })) : null] }));
}
//# sourceMappingURL=QueryPage.js.map