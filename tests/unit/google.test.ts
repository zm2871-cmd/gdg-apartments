import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {getGoogleReviews} from '../../src/lib/google';

// Hand-written, shaped like a live response checked 2026-11-10. Real Google content isn't saved (ToS §3.2.3(a)).
const review=(over={})=>({name:'places/p/reviews/r',rating:4,text:{text:'Nice lobby',languageCode:'en'},originalText:{text:'Nice lobby',languageCode:'en'},
  authorAttribution:{displayName:'A. Tenant',uri:'https://www.google.com/maps/contrib/1',photoUri:'https://lh3.googleusercontent.com/a'},
  relativePublishTimeDescription:'2 months ago',publishTime:'2026-09-01T00:00:00Z',flagContentUri:'https://www.google.com/local/review/rap/report?x',googleMapsUri:'https://www.google.com/maps/reviews/r',...over});
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status});
let fetchMock:ReturnType<typeof vi.fn>;

beforeEach(()=>{vi.stubEnv('GOOGLE_MAPS_API_KEY','test-key');fetchMock=vi.fn();vi.stubGlobal('fetch',fetchMock);vi.spyOn(console,'error').mockImplementation(()=>{});});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});

it('returns rating and reviews in Google order, uncached, with the right mask',async()=>{
  fetchMock.mockResolvedValue(json({id:'p1',rating:4.2,userRatingCount:37,googleMapsUri:'https://maps.google.com/?cid=1',
    reviews:[review(),review({rating:2,text:{text:'Bonito',languageCode:'en'},originalText:{text:'Bonito',languageCode:'es'}})]}));
  const r=await getGoogleReviews('p1');
  expect(r).toMatchObject({placeId:'p1',rating:4.2,ratingCount:37,url:'https://maps.google.com/?cid=1'});
  if(!r||r==='not_found')throw new Error('expected reviews');
  expect(r.reviews.map(x=>x.rating)).toEqual([4,2]);
  expect(r.reviews[0]).toEqual({rating:4,text:'Nice lobby',originalText:'Nice lobby',translated:false,author:'A. Tenant',authorUri:'https://www.google.com/maps/contrib/1',
    authorPhotoUri:'https://lh3.googleusercontent.com/a',relativeTime:'2 months ago',url:'https://www.google.com/maps/reviews/r',flagUrl:'https://www.google.com/local/review/rap/report?x'});
  expect(r.reviews[1].translated).toBe(true);
  const [url,init]=fetchMock.mock.calls[0];
  expect(url).toBe('https://places.googleapis.com/v1/places/p1');
  expect(init.headers).toEqual({'X-Goog-Api-Key':'test-key','X-Goog-FieldMask':'id,rating,userRatingCount,reviews,googleMapsUri'});
  expect(init.cache).toBe('no-store');
});

it('treats a place without ratings or reviews as empty, not an error',async()=>{
  fetchMock.mockResolvedValue(json({id:'p1'}));
  expect(await getGoogleReviews('p1')).toEqual({placeId:'p1',rating:null,ratingCount:0,url:null,reviews:[]});
});

it('handles a rating-only review without text',async()=>{
  fetchMock.mockResolvedValue(json({id:'p1',rating:5,userRatingCount:1,reviews:[review({text:undefined,originalText:undefined})]}));
  const r=await getGoogleReviews('p1');
  expect(r!=='not_found'&&r?.reviews[0]).toMatchObject({text:null,translated:false});
});

it('returns not_found on 404',async()=>{
  fetchMock.mockResolvedValue(json({error:{status:'NOT_FOUND'}},404));
  expect(await getGoogleReviews('gone')).toBe('not_found');
});

it.each([
  ['a 5xx',()=>fetchMock.mockResolvedValue(json({error:{}},503))],
  ['a 403',()=>fetchMock.mockResolvedValue(json({error:{status:'PERMISSION_DENIED'}},403))],
  ['a network error',()=>fetchMock.mockRejectedValue(new Error('timeout'))],
  ['a malformed body',()=>fetchMock.mockResolvedValue(json({reviews:'nope'}))],
])('returns null without throwing on %s',async(_,setup)=>{
  setup();
  expect(await getGoogleReviews('p1')).toBeNull();
  expect(console.error).toHaveBeenCalled();
});

it('rejects a bad place ID or missing key without calling Google',async()=>{
  expect(await getGoogleReviews('../admin')).toBeNull();
  vi.stubEnv('GOOGLE_MAPS_API_KEY','');
  expect(await getGoogleReviews('p1')).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});
