declare module 'ggwave' {
  const factory: () => Promise<any>;
  export default factory;
}

declare module 'qrcode' {
  export function create(text: string, options?: any): any;
}
