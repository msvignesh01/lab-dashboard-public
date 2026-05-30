import React from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCw } from 'lucide-react';

/**
 * ErrorBoundary component to catch JavaScript errors anywhere in the component tree
 * Displays a fallback UI instead of crashing the whole app (I12)
 */
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        // Update state so the next render shows the fallback UI
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        // Security: Only log errors in development to prevent stack trace leakage
        if (import.meta.env.DEV) {
            console.error('ErrorBoundary caught an error:', error, errorInfo);
        }
        this.setState({ errorInfo });

        // In production, you might want to send this to an error tracking service
        // e.g., Sentry, LogRocket, etc.
    }

    handleReload = () => {
        // Clear error state and reload the page
        this.setState({ hasError: false, error: null, errorInfo: null });
        window.location.reload();
    };

    handleRetry = () => {
        // Just clear error state and try to re-render
        this.setState({ hasError: false, error: null, errorInfo: null });
    };

    render() {
        if (this.state.hasError) {
            // Fallback UI
            return (
                <div className="min-h-[100dvh] flex items-center justify-center bg-background p-4">
                    <div className="max-w-md w-full text-center space-y-6">
                        <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
                            <AlertCircle className="h-8 w-8 text-destructive" />
                        </div>

                        <div className="space-y-2">
                            <h1 className="text-2xl font-bold text-foreground">Something went wrong</h1>
                            <p className="text-muted-foreground">
                                We're sorry, but something unexpected happened. Please try refreshing the page.
                            </p>
                        </div>

                        {/* Show error details in development */}
                        {import.meta.env.DEV && this.state.error && (
                            <details className="text-left bg-muted p-4 rounded-lg text-sm max-h-[40vh] overflow-auto">
                                <summary className="cursor-pointer font-medium text-foreground">
                                    Error details (dev only)
                                </summary>
                                <pre className="mt-2 overflow-auto text-xs text-muted-foreground whitespace-pre-wrap">
                                    {this.state.error.toString()}
                                    {this.state.errorInfo?.componentStack}
                                </pre>
                            </details>
                        )}

                        <div className="flex gap-3 justify-center">
                            <Button variant="outline" onClick={this.handleRetry}>
                                Try Again
                            </Button>
                            <Button onClick={this.handleReload}>
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Refresh Page
                            </Button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
