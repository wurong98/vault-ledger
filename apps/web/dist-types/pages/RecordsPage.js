import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
const TYPE_LABELS = {
    expense: '支出',
    income: '收入',
    transfer: '转账',
    lend: '借出',
    borrow: '借入',
    repayment_received: '收回',
    repayment_paid: '归还',
};
export function RecordsPage({ ledger }) {
    const [records, setRecords] = useState([]);
    const [filters, setFilters] = useState({ type: '', keyword: '', dateFrom: '', dateTo: '' });
    const [includeVoided, setIncludeVoided] = useState(false);
    useEffect(() => {
        if (!ledger)
            return;
        const params = new URLSearchParams();
        if (filters.type)
            params.set('type', filters.type);
        if (filters.keyword)
            params.set('keyword', filters.keyword);
        if (filters.dateFrom)
            params.set('dateFrom', filters.dateFrom);
        if (filters.dateTo)
            params.set('dateTo', filters.dateTo);
        if (includeVoided)
            params.set('includeVoided', 'true');
        void (async () => {
            const result = await api.get(`/ledgers/${ledger.id}/records?${params.toString()}`);
            setRecords(result.records);
        })();
    }, [ledger, filters, includeVoided]);
    if (!ledger)
        return _jsx("div", { className: "card", children: "\u6B63\u5728\u52A0\u8F7D\u8D26\u672C\u2026" });
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "card", children: [_jsx("h2", { children: "\u6D41\u6C34" }), _jsx("label", { htmlFor: "filter-type", children: "\u7C7B\u578B" }), _jsxs("select", { id: "filter-type", value: filters.type, onChange: (e) => setFilters({ ...filters, type: e.target.value }), children: [_jsx("option", { value: "", children: "\u5168\u90E8" }), Object.entries(TYPE_LABELS).map(([value, label]) => (_jsx("option", { value: value, children: label }, value)))] }), _jsx("label", { htmlFor: "filter-keyword", children: "\u5173\u952E\u8BCD" }), _jsx("input", { id: "filter-keyword", value: filters.keyword, onChange: (e) => setFilters({ ...filters, keyword: e.target.value }), placeholder: "\u5546\u6237\u3001\u5206\u7C7B\u3001\u5907\u6CE8" }), _jsxs("div", { className: "grid2", children: [_jsxs("div", { children: [_jsx("label", { htmlFor: "filter-from", children: "\u5F00\u59CB\u65E5\u671F" }), _jsx("input", { id: "filter-from", type: "date", value: filters.dateFrom, onChange: (e) => setFilters({ ...filters, dateFrom: e.target.value }) })] }), _jsxs("div", { children: [_jsx("label", { htmlFor: "filter-to", children: "\u7ED3\u675F\u65E5\u671F" }), _jsx("input", { id: "filter-to", type: "date", value: filters.dateTo, onChange: (e) => setFilters({ ...filters, dateTo: e.target.value }) })] })] }), _jsxs("label", { className: "row", children: [_jsx("input", { type: "checkbox", style: { width: 'auto', marginBottom: 0 }, checked: includeVoided, onChange: (e) => setIncludeVoided(e.target.checked) }), _jsx("span", { children: "\u5305\u542B\u5DF2\u4F5C\u5E9F\u8BB0\u5F55" })] })] }), _jsx("div", { className: "card", children: records.length === 0 ? (_jsx("p", { className: "muted", children: "\u6CA1\u6709\u7B26\u5408\u6761\u4EF6\u7684\u8BB0\u5F55" })) : (records.map((record) => (_jsxs(Link, { className: "list-item", to: `/records/${record.id}`, children: [_jsxs("span", { children: [record.occurredOn, " \u00B7 ", TYPE_LABELS[record.type] ?? record.type, record.merchant ? ` · ${record.merchant}` : '', record.category ? ` · ${record.category}` : '', record.status === 'voided' ? ' · 已作废' : ''] }), _jsxs("span", { className: "amount", children: ["\u00A5", record.amount] })] }, record.id)))) })] }));
}
//# sourceMappingURL=RecordsPage.js.map