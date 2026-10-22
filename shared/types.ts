export interface User { id: string; name: string; email: string; role: 'user'|'admin'; }
export interface Artist {id:string;name:string;bio:string;image:string;}
export interface Album {id:string;title:string;artistId:string;artistName:string;cover:string;year:number;}
export interface Track {id:string;title:string;artistId:string;artistName:string;albumId:string;albumTitle:string;cover:string;duration:number;audioUrl:string;category:string;license:string;}
export interface Playlist {id:string;name:string;description:string;cover:string;ownerId:string|null;ownerName:string;isPublic:boolean;trackIds:string[];}
export interface Catalog {tracks:Track[];artists:Artist[];albums:Album[];playlists:Playlist[];total:number;}
export interface Library {likedTrackIds:string[];savedAlbumIds:string[];followedArtistIds:string[];playlists:Playlist[];}
export interface Preferences {volume:number;shuffle:boolean;repeat:'off'|'all'|'one';}
