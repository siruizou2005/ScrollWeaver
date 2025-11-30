module.exports = [
"[project]/src/app/favicon.ico (static in ecmascript, tag client)", (() => {{

throw new Error("An error occurred while generating the chunk item [project]/src/app/favicon.ico (static in ecmascript, tag client)\n\nCaused by:\n- StaticAsset::path: not found\n\nDebug info:\n- An error occurred while generating the chunk item [project]/src/app/favicon.ico (static in ecmascript, tag client)\n- Execution of <StaticUrlJsChunkItem as EcmascriptChunkItem>::content failed\n- Execution of <StaticOutputAsset as OutputAsset>::path failed\n- StaticAsset::path: not found");

}}),
"[project]/src/app/favicon.ico.mjs { IMAGE => \"[project]/src/app/favicon.ico (static in ecmascript, tag client)\" } [app-rsc] (structured image object, ecmascript)", ((__turbopack_context__, module, exports) => {

const e = new Error("Could not parse module '[project]/src/app/favicon.ico.mjs'\n\nInput image not found\n\nDebug info:\n- Execution of <StructuredImageFileSource as Asset>::content failed\n- Execution of get_meta_data failed\n- Input image not found");
e.code = 'MODULE_UNPARSABLE';
throw e;
}),
];