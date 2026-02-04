import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import ErrorBoundary from "./components/ErrorBoundary";
import RunPage from "./pages/RunPage";
import ResultsPage from "./pages/ResultsPage";
import ComparePage from "./pages/ComparePage";
import TrendsPage from "./pages/TrendsPage";
import NotFoundPage from "./pages/NotFoundPage";

function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/run" replace />} />
          <Route path="/run" element={<RunPage />} />
          <Route path="/results" element={<ResultsPage />} />
          <Route path="/results/:id" element={<ResultsPage />} />
          <Route path="/compare" element={<ComparePage />} />
          <Route path="/trends" element={<TrendsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
