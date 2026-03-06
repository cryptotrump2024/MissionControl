import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Layout from '@/components/Layout';
import Dashboard from '@/pages/Dashboard';
import Agents from '@/pages/Agents';
import Tasks from '@/pages/Tasks';
import Logs from '@/pages/Logs';
import Costs from '@/pages/Costs';
import Approvals from '@/pages/Approvals';
import '@/styles/globals.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: 10000, // Refetch every 10 seconds
      staleTime: 5000,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/agents" element={<Agents />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/logs" element={<Logs />} />
            <Route path="/costs" element={<Costs />} />
            <Route path="/approvals" element={<Approvals />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
