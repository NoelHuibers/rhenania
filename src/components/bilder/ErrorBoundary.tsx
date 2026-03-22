// components/image-manager/ErrorBoundary.tsx
"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";

interface Props {
	children: ReactNode;
	fallback?: ReactNode;
}

interface State {
	hasError: boolean;
	error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
	public state: State = {
		hasError: false,
	};

	public static getDerivedStateFromError(error: Error): State {
		return { hasError: true, error };
	}

	public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
		console.error("Image Manager Error:", error, errorInfo);
	}

	private handleRetry = () => {
		this.setState({ hasError: false, error: undefined });
	};

	public render() {
		if (this.state.hasError) {
			if (this.props.fallback) {
				return this.props.fallback;
			}

			return (
				<div className="flex min-h-screen items-center justify-center bg-background p-6">
					<Card className="w-full max-w-md">
						<CardHeader className="text-center">
							<div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
								<AlertTriangle className="h-8 w-8 text-red-600" />
							</div>
							<CardTitle className="text-red-600">
								Etwas ist schiefgelaufen
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4 text-center">
							<p className="text-muted-foreground">
								Der Image Manager konnte nicht geladen werden. Bitte versuchen
								Sie es erneut.
							</p>
							{this.state.error && (
								<details className="rounded bg-gray-100 p-3 text-left text-sm">
									<summary className="mb-2 cursor-pointer font-medium text-gray-700">
										Fehlerdetails
									</summary>
									<code className="break-all text-red-600">
										{this.state.error.message}
									</code>
								</details>
							)}
							<div className="flex justify-center gap-2">
								<Button
									onClick={this.handleRetry}
									className="flex items-center gap-2"
								>
									<RefreshCw className="h-4 w-4" />
									Erneut versuchen
								</Button>
								<Button
									variant="outline"
									onClick={() => window.location.reload()}
								>
									Seite neu laden
								</Button>
							</div>
						</CardContent>
					</Card>
				</div>
			);
		}

		return this.props.children;
	}
}
