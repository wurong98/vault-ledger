import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Contact, Ledger } from '@ledgerbox/contracts';
import { api } from '../api.js';

export function ContactsPage({ ledger }: { ledger: Ledger | null }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [keyword, setKeyword] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [remark, setRemark] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const lock = useRef(false);
  const refresh = async () => {
    if (!ledger) return;
    const result = await api.get<{ contacts: Contact[] }>(`/ledgers/${ledger.id}/contacts`);
    setContacts(result.contacts);
  };
  useEffect(() => { void refresh().catch(err => setError(err instanceof Error ? err.message : '读取失败')); }, [ledger]);
  if (!ledger) return <div className="card">正在加载账本…</div>;
  const save = async () => {
    if (lock.current || !name.trim()) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const path = `/ledgers/${ledger.id}/contacts`;
      const body = { displayName: name.trim(), remark: remark.trim() || null };
      if (editing) await api.patch(`${path}/${editing}`, body); else await api.post(path, body);
      setEditing(null); setName(''); setRemark(''); setMessage('联系人已保存'); await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : '保存失败'); }
    finally { lock.current = false; setBusy(false); }
  };
  const remove = async (contact: Contact) => {
    if (lock.current || !window.confirm(`删除联系人“${contact.displayName}”？已关联账单的联系人会保留。`)) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try {
      await api.delete(`/ledgers/${ledger.id}/contacts/${contact.id}`);
      if (editing === contact.id) { setEditing(null); setName(''); setRemark(''); }
      await refresh(); setMessage('联系人已删除');
    } catch (err) { setError(err instanceof Error ? err.message : '删除失败'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <>
    <div className="page-heading"><span className="eyebrow">CONTACTS</span><h2>联系人</h2><p>{ledger.name} · 借出、借入和还款，都能找到对应的人</p><Link to="/settings">返回设置</Link></div>
    <form className="card" onSubmit={e => { e.preventDefault(); void save(); }}>
      <h2>{editing ? '编辑联系人' : '新增联系人'}</h2>
      <label htmlFor="contact-name">姓名 / 称呼</label><input id="contact-name" value={name} maxLength={60} disabled={busy} onChange={e => setName(e.target.value)} placeholder="例如：杨老板" required />
      <label htmlFor="contact-remark">备注</label><input id="contact-remark" value={remark} maxLength={200} disabled={busy} onChange={e => setRemark(e.target.value)} placeholder="帮助你分辨同名的人" />
      <div className="row"><button className="primary" disabled={busy || !name.trim()}>{busy ? '处理中…' : '保存联系人'}</button>{editing ? <button type="button" disabled={busy} onClick={() => { setEditing(null); setName(''); setRemark(''); }}>取消编辑</button> : null}</div>
      {error ? <p className="error" role="alert">{error}</p> : null}{message ? <p className="ok" role="status">{message}</p> : null}
    </form>
    <div className="card"><h2>全部联系人 · {contacts.length}</h2><label htmlFor="contact-search">搜索联系人</label><input id="contact-search" value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="搜索姓名或备注" />
      {contacts.filter(c => [c.displayName, c.remark ?? ''].some(value => value.includes(keyword.trim()))).map(contact => <div className="list-item" key={contact.id}><div><strong>{contact.displayName}</strong>{contact.remark ? <div className="muted">{contact.remark}</div> : null}</div><div className="row"><button disabled={busy} onClick={() => { setEditing(contact.id); setName(contact.displayName); setRemark(contact.remark ?? ''); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>编辑</button><button className="danger" disabled={busy} onClick={() => void remove(contact)}>删除</button></div></div>)}
      {!contacts.length ? <p className="muted">暂时没有联系人。也可以直接聊天记账，AI 会把新联系人列入待确认清单。</p> : null}
    </div>
  </>;
}
