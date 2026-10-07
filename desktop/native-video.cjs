// Only main-process-owned HWNDs are passed here; never expose native handles to IPC.
const koffi=require('koffi');
const user32=koffi.load('user32.dll');
const find=user32.func('void * __stdcall FindWindowExW(void *parent, void *after, const char16_t *className, const char16_t *title)');
const style=user32.func('long __stdcall GetWindowLongW(void *window, int index)');
const firstChild=user32.func('void * __stdcall GetWindow(void *window, unsigned int command)');
const position=user32.func('int __stdcall SetWindowPos(void *window, void *after, int x, int y, int width, int height, unsigned int flags)');
function raiseVideo(window,mini=false){
 const handle=window.getNativeWindowHandle().readBigUInt64LE(0);
 const child=find(handle,null,'mpv',null);
 if(mini&&!(style(handle,-20)&8))position(handle,-1n,0,0,0,0,0x0001|0x0002|0x0010|0x0200);
 // Electron's compositor also creates a native D3D child. Keep mpv above it.
 if(child&&firstChild(handle,5)!==child)position(child,null,0,0,0,0,0x0001|0x0002|0x0010|0x0200); // NOSIZE | NOMOVE | NOACTIVATE
 return Boolean(child);
}
module.exports={raiseVideo};
