import type {Metadata} from 'next';import './globals.css';
export const metadata:Metadata={title:{default:'AptSignal — Your next chapter starts here',template:'%s | AptSignal'},description:'Secure account access for AptSignal.',icons:{icon:'/favicon.svg'},robots:{index:false,follow:false}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body><a href="#main" className="skip-link">Skip to content</a>{children}</body></html>;}
