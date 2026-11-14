import { jsx as _jsx } from "react/jsx-runtime";
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App.js';
import './styles.css';
const container = document.getElementById('root');
if (!container)
    throw new Error('缺少 #root 挂载点');
createRoot(container).render(_jsx(React.StrictMode, { children: _jsx(BrowserRouter, { children: _jsx(App, {}) }) }));
//# sourceMappingURL=main.js.map