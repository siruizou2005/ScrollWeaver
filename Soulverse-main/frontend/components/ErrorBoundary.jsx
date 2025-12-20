import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-screen bg-black flex items-center justify-center text-white">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">出错了</h1>
            <p className="text-slate-400 mb-4">{this.state.error?.message || '未知错误'}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-cyan-500 text-black rounded-lg"
            >
              刷新页面
            </button>
            <details className="mt-4 text-left text-xs text-slate-500">
              <summary className="cursor-pointer">错误详情</summary>
              <pre className="mt-2 overflow-auto max-h-64">
                {this.state.error?.stack}
              </pre>
            </details>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

