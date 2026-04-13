import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      let errorMessage = "Une erreur inattendue s'est produite.";
      let errorDetails = null;

      try {
        if (this.state.error?.message) {
          const parsedError = JSON.parse(this.state.error.message);
          if (parsedError.error && parsedError.operationType) {
            errorMessage = "Erreur de permission (Base de données)";
            errorDetails = (
              <div className="mt-4 text-left bg-red-50 p-4 rounded-lg overflow-auto text-xs font-mono text-red-800">
                <p><strong>Opération:</strong> {parsedError.operationType}</p>
                <p><strong>Chemin:</strong> {parsedError.path}</p>
                <p><strong>Détail:</strong> {parsedError.error}</p>
              </div>
            );
          }
        }
      } catch (e) {
        // Not a JSON error, fallback to standard message
        errorDetails = (
          <div className="mt-4 text-left bg-red-50 p-4 rounded-lg overflow-auto text-xs font-mono text-red-800">
            {this.state.error?.message}
          </div>
        );
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-stone-50 p-4">
          <div className="bg-white p-8 rounded-2xl shadow-xl max-w-lg w-full text-center">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-stone-800 mb-2">Oups !</h1>
            <p className="text-stone-600">{errorMessage}</p>
            {errorDetails}
            <button
              className="mt-6 bg-stone-800 text-white px-6 py-2 rounded-lg hover:bg-stone-900 transition-colors"
              onClick={() => window.location.reload()}
            >
              Recharger la page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
