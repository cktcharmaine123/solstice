declare module "tz-lookup" {
  const tzlookup: (lat: number, lng: number) => string | null;
  export default tzlookup;
}
