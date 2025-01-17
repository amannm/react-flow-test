// SPDX-FileCopyrightText: 2023 Dash0 Inc.
// SPDX-License-Identifier: Apache-2.0

"use client";

import {useCallback, useEffect, useMemo, useState} from "react";
import type {IError} from "./ValidationErrorConsole";
import ValidationErrorConsole from "./ValidationErrorConsole";
import EditorTopBar from "../EditorTopBar";
import {useEditorDidMount, useEditorRef, useMonacoRef, useViewMode} from "~/contexts/EditorContext";
import MonacoEditor, {type OnChange} from "@monaco-editor/react";
import {ReactFlowProvider} from "reactflow";
import Flow from "../react-flow/ReactFlow";
import {useUrlState} from "~/lib/urlState/client/useUrlState";
import AppHeader from "../AppHeader";
import WelcomeModal from "../welcome-modal/WelcomeModal";
import {
	useServerSideValidationEnabled,
	validateOtelCollectorConfigurationAndSetMarkers,
} from "~/components/monaco-editor/otelCollectorConfigValidation";
import {editorBinding} from "~/components/monaco-editor/editorBinding";
import {AppFooter} from "~/components/AppFooter";
import {AutoSizer} from "~/components/AutoSizer";
import {ResizeBar} from "~/components/monaco-editor/ResizeBar";
import {Fira_Code} from "next/font/google";
import {PanelLeftOpen} from "lucide-react";
import {IconButton} from "~/components/icon-button";
import {Tooltip, TooltipContent, TooltipTrigger} from "~/components/tooltip";
import {track} from "@vercel/analytics";
import {useServerSideValidation} from "../validation/useServerSideValidation";
import {selectConfigType} from "./parseYaml";

const firaCode = Fira_Code({
	display: "swap",
	adjustFontFallback: false,
	subsets: ["latin"],
});

export default function Editor({ locked, setLocked }: { locked: boolean; setLocked: (locked: boolean) => void }) {
	const editorDidMount = useEditorDidMount();
	const editorRef = useEditorRef();
	const monacoRef = useMonacoRef();
	const [width, setWidth] = useState(Number(localStorage.getItem("width") ?? 440));
	const { setViewMode, viewMode } = useViewMode();
	const savedOpenModal = Boolean(typeof window !== "undefined" && localStorage.getItem("welcomeModal"));
	const [openDialog, setOpenDialog] = useState(savedOpenModal ? !savedOpenModal : true);
	const [{ config }, getLink] = useUrlState([editorBinding]);
	const [currentConfig, setCurrentConfig] = useState<string>(config);
	const serverSideValidationResult = useServerSideValidation();
	const isServerValidationEnabled = useServerSideValidationEnabled();
	const onWidthChange = useCallback((newWidth: number) => {
		localStorage.setItem("width", String(newWidth));
		setWidth(newWidth);
	}, []);

	const onChangeConfig = useCallback(
		(newConfig: string) => {
			if (typeof window !== "undefined") {
				window.history.pushState(null, "", getLink({ config: newConfig }));
			}
		},
		[getLink]
	);

	const totalValidationErrors = useMemo((): IError => {
		if (editorRef && monacoRef) {
			return validateOtelCollectorConfigurationAndSetMarkers(
				currentConfig,
				editorRef,
				monacoRef,
				isServerValidationEnabled,
				serverSideValidationResult
			);
		} else {
			return {};
		}
	}, [currentConfig, editorRef, monacoRef, serverSideValidationResult, isServerValidationEnabled]);

	const isValidConfig = totalValidationErrors.yamlError == null && (totalValidationErrors.ajvErrors?.length ?? 0) === 0;

	const handleEditorChange: OnChange = (value) => {
		const configType = selectConfigType(value ?? "");
		setCurrentConfig((configType as string) ?? "");
	};

	useEffect(() => {
		if (config !== editorBinding.fallback) {
			track("Opened with non-default config");
		}
		// eslint-disable-next-line
	}, []);

	useEffect(() => {
		// This is done to support config restoration when signing in. See the
		// /restore page. Without this we ran into return URL problems with GitHub
		// and Google as our return URL can be **very** long.
		localStorage.setItem("config-restore", config);
	}, [config]);

	useEffect(() => {
		// This useEffect is used to detect changes in the "currentConfig" state
		// and trigger the "onChangeConfig" function when it differs from the "config"
		// to prevent the conflict with monaco editor's "onChange" event that makes sudden
		// movements of the cursor
		if (currentConfig !== config) {
			onChangeConfig(currentConfig);
		}
	}, [onChangeConfig, currentConfig, config]);

	function calculateViewWidth(viewMode: string, width: number) {
		switch (viewMode) {
			case "code":
				return "100%";
			case "pipeline":
				return "0px";
			default:
				return `${width}px`;
		}
	}

	return (
		<>
			<WelcomeModal open={openDialog} setOpen={setOpenDialog} />
			<div className="flex h-full max-h-screen min-h-screen flex-col">
				<ReactFlowProvider>
					<AppHeader />
					<div className="flex h-full w-full shrink grow">
						<div
							className={`relative flex shrink-0 flex-col`}
							style={{
								width: calculateViewWidth(viewMode, width),
							}}
						>
							<EditorTopBar config={currentConfig} font={firaCode} />
							<div className={`h-full w-full shrink grow ${firaCode.className}`}>
								{(
									<AutoSizer>
										{({ width, height }) => (
											<MonacoEditor
												defaultValue={config}
												value={config}
												onMount={editorDidMount}
												width={width}
												height={height}
												defaultLanguage="yaml"
												theme="OTelBin"
												options={{
													quickSuggestions: { other: true, strings: true },
													automaticLayout: true,
													minimap: { enabled: false },
													scrollbar: { verticalScrollbarSize: 8, horizontal: "hidden" },
													padding: { top: 5 },
													fontSize: 13,
													fontWeight: "400",
													fontFamily: firaCode.style.fontFamily,
												}}
												onChange={handleEditorChange}
											/>
										)}
									</AutoSizer>
								)}
							</div>
							{viewMode !== "pipeline" && <ValidationErrorConsole errors={totalValidationErrors} font={firaCode} />}
							{viewMode == "both" && <ResizeBar onWidthChange={onWidthChange} />}
						</div>
						<div className="z-0 min-h-full w-full shrink grow relative">
							<AutoSizer>
								{({ width, height }) => (
									<div style={{ width: `${width}px`, height: `${height}px` }}>
										<Flow
											value={(isValidConfig && currentConfig) || "{}"}
											openDialog={setOpenDialog}
											locked={locked}
											setLocked={setLocked}
											editorRef={editorRef}
										/>
									</div>
								)}
							</AutoSizer>

							{viewMode === "pipeline" && (
								<Tooltip>
									<TooltipTrigger asChild>
										<IconButton onClick={() => setViewMode("both")} size={"xs"} className="absolute top-4 left-4 z-1">
											<PanelLeftOpen />
										</IconButton>
									</TooltipTrigger>
									<TooltipContent>Show editor</TooltipContent>
								</Tooltip>
							)}
						</div>
					</div>
					<AppFooter />
				</ReactFlowProvider>
			</div>
		</>
	);
}
