import type { SVGProps } from "react";

export function BrandMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 360 280" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M67 260C35 260 15 242 15 214v-40c0-31 18-48 48-55 14-3 19-15 27-31 17-34 49-53 90-53 43 0 75 20 90 57 7 16 12 27 26 31 30 9 49 27 49 57v34c0 30-18 46-50 46H67Zm55-84c0-14 6-22 15-22s15 8 15 22v18c0 14-6 22-15 22s-15-8-15-22v-18Zm86 0c0-14 6-22 15-22s15 8 15 22v18c0 14-6 22-15 22s-15-8-15-22v-18Z"
      />
    </svg>
  );
}
