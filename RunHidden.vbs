Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
cmd = "powershell -NoProfile -ExecutionPolicy Bypass -File """ & scriptDir & "\OpenWhenReady.ps1"""
CreateObject("WScript.Shell").Run cmd, 0, False
