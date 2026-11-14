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
export function HomePage({ ledger, onRefresh, }) {
    const [summary, setSummary] = useState(null);
    const [debts, setDebts] = useState([]);
    const [records, setRecords] = useState([]);
    const [backup, setBackup] = useState(null);
    useEffect(() => {
        if (!ledger)
            return;
        void (async () => {
            const [s, d, r] = await Promise.all([
                api.get(`/ledgers/${ledger.id}/summary`),
                api.get(`/ledgers/${ledger.id}/debts`),
                api.get(`/ledgers/${ledger.id}/records?limit=8`),
            ]);
            setSummary(s.summary);
            setDebts(d.debts);
            setRecords(r.records);
        })();
    }, [ledger]);
    useEffect(() => {
        void (async () => {
            try {
                const settings = await api.get('/settings/backup');
                setBackup(settings);
            }
            catch {
                setBackup(null);
            }
        })();
    }, []);
    if (!ledger)
        return _jsx("div", { className: "card", children: "\u6B63\u5728\u52A0\u8F7D\u8D26\u672C\u2026" });
    const hasNewChanges = backup !== null &&
        backup.snapshotRevision !== null &&
        backup.snapshotRevision < backup.currentRevision;
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "card", children: [_jsxs("h2", { children: ["\u6982\u89C8 \u00B7 ", ledger.name] }), _jsxs("div", { className: "grid2", children: [_jsxs("div", { children: [_jsx("p", { className: "muted", children: "\u65E5\u5E38\u6536\u5165" }), _jsx("p", { className: "amount", children: summary?.income ?? '—' })] }), _jsxs("div", { children: [_jsx("p", { className: "muted", children: "\u65E5\u5E38\u652F\u51FA" }), _jsx("p", { className: "amount", children: summary?.expense ?? '—' })] }), _jsxs("div", { children: [_jsx("p", { className: "muted", children: "\u5BF9\u65B9\u6B20\u6211" }), _jsx("p", { className: "amount", children: summary?.receivable ?? '—' })] }), _jsxs("div", { children: [_jsx("p", { className: "muted", children: "\u6211\u6B20\u5BF9\u65B9" }), _jsx("p", { className: "amount", children: summary?.payable ?? '—' })] })] }), _jsxs("p", { className: "muted", children: ["\u5171 ", summary?.recordCount ?? 0, " \u7B14\u6709\u6548\u8BB0\u5F55"] })] }), hasNewChanges ? (_jsx("div", { className: "card", children: _jsx("p", { className: "muted", children: "\u6709\u65B0\u7684\u4FEE\u6539\u5C1A\u672A\u5305\u542B\u5728\u6700\u8FD1\u4E00\u6B21\u5907\u4EFD\u4E2D\uFF0C\u5EFA\u8BAE\u91CD\u65B0\u4E0B\u8F7D\u5907\u4EFD\u3002" }) })) : null, _jsxs("div", { className: "card", children: [_jsx("h2", { children: "\u501F\u8FD8\u6B3E" }), debts.length === 0 ? (_jsx("p", { className: "muted", children: "\u6682\u65E0\u501F\u8FD8\u6B3E\u8BB0\u5F55" })) : (debts.map((debt) => (_jsxs("div", { className: "list-item", children: [_jsx("span", { children: debt.contactName }), _jsx("span", { className: "amount", children: debt.direction === 'they_owe_me'
                                    ? `对方欠我 ${debt.receivable}`
                                    : debt.direction === 'i_owe_them'
                                        ? `我欠对方 ${debt.payable}`
                                        : debt.direction === 'inconsistent'
                                            ? '多收/多还或缺少历史'
                                            : '已结清' })] }, debt.contactId))))] }), _jsxs("div", { className: "card", children: [_jsxs("div", { className: "row", children: [_jsx("h2", { style: { flex: 1 }, children: "\u6700\u8FD1\u8BB0\u5F55" }), _jsx(Link, { to: "/capture", children: _jsx("button", { className: "primary", children: "\u622A\u56FE\u5F55\u5165" }) })] }), records.length === 0 ? (_jsx("p", { className: "muted", children: "\u8FD8\u6CA1\u6709\u8BB0\u5F55\uFF0C\u53BB\u5F55\u5165\u7B2C\u4E00\u7B14\u5427" })) : (records.map((record) => (_jsxs(Link, { className: "list-item", to: `/records/${record.id}`, children: [_jsxs("span", { children: [record.occurredOn, " \u00B7 ", TYPE_LABELS[record.type] ?? record.type, record.merchant ? ` · ${record.merchant}` : '', record.category ? ` · ${record.category}` : ''] }), _jsxs("span", { className: "amount", children: ["\u00A5", record.amount] })] }, record.id))))] }), _jsx("div", { className: "card", children: _jsx("button", { onClick: onRefresh, children: "\u5237\u65B0\u6570\u636E" }) })] }));
}
//# sourceMappingURL=HomePage.js.map