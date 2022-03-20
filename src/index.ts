const url = new URL('../lib/demo.ts').href;
export function getTsPacket () {

  fetch(url).then((res: any) => {
    const bytes = new Uint8Array(res);
    console.log(bytes);
  }).catch((e) => {
    console.log('error', e);
  })
}