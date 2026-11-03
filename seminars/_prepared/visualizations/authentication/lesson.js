import {diagram} from '../common/diagram.js';
export function authenticationComparison(){return diagram(new URL('./static/comparison.svg',import.meta.url));}
export function passkeyRegistration(){return diagram(new URL('./static/registration.svg',import.meta.url));}
export function passkeyLogin(){return diagram(new URL('./static/login.svg',import.meta.url));}
