import { Component, type ErrorInfo, type ReactNode } from "react";
import { Alert, Button, Container } from "react-bootstrap";

type Props = {
  children: ReactNode;
};

type State = {
  error: Error | null;
};

/**
 * Catches render errors in the route tree so a single bad page
 * does not blank the whole panel.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[guartrix] UI error boundary:", error, info.componentStack);
  }

  private retry = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <Container className="py-5" style={{ maxWidth: 520 }}>
        <Alert variant="danger" className="mb-3">
          <Alert.Heading>Something went wrong</Alert.Heading>
          <p className="mb-0">
            This page hit an unexpected error. You can try again, or go back to
            the dashboard.
          </p>
        </Alert>
        <div className="d-flex flex-wrap gap-2">
          <Button variant="primary" onClick={this.retry}>
            Try again
          </Button>
          <Button
            variant="outline-secondary"
            onClick={() => {
              window.location.assign("/");
            }}
          >
            Go to dashboard
          </Button>
        </div>
      </Container>
    );
  }
}
