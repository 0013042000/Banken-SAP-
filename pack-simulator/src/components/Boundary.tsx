import { Component, type ReactNode } from 'react';

interface Props { readonly fallback: ReactNode; readonly onError?: () => void; readonly children: ReactNode }
interface State { readonly failed: boolean }

/** Fängt Lade- und Laufzeitfehler eines Teilbereichs ab, damit nie die ganze Seite ausfällt. */
export class Boundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State { return { failed: true }; }

  componentDidCatch(): void { this.props.onError?.(); }

  render(): ReactNode { return this.state.failed ? this.props.fallback : this.props.children; }
}
