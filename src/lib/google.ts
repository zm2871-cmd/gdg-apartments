import 'server-only';
import {z} from 'zod';
import type {SupabaseClient} from '@supabase/supabase-js';

// GMAPS-04. Live Place Details for one building. Nothing here may be stored or cached (Google Maps ToS §3.2.3(a),(b)).
// Enterprise + Atmosphere tier, the most expensive: call only when a user opens the Google reviews view.
const MASK='id,rating,userRatingCount,reviews,googleMapsUri';

const text=z.object({text:z.string(),languageCode:z.string().optional()});
const detailsSchema=z.object({
  id:z.string(),
  rating:z.number().optional(),
  userRatingCount:z.number().optional(),
  googleMapsUri:z.string().url().optional(),
  reviews:z.array(z.object({
    rating:z.number(),
    text:text.optional(),            // missing for rating-only reviews
    originalText:text.optional(),
    authorAttribution:z.object({displayName:z.string(),uri:z.string().url().optional(),photoUri:z.string().url().optional()}),
    relativePublishTimeDescription:z.string().optional(),
    googleMapsUri:z.string().url(),
    flagContentUri:z.string().url().optional(),
  })).optional(),
});

export type GoogleReview={rating:number;text:string|null;originalText:string|null;translated:boolean;author:string;authorUri:string|null;authorPhotoUri:string|null;relativeTime:string|null;url:string;flagUrl:string|null};
export type GoogleReviews={placeId:string;rating:number|null;ratingCount:number;url:string|null;reviews:GoogleReview[]};

type PipelineDb=Pick<SupabaseClient,'from'>;

/**
 * GMAPS-07. Looks up the building's place ID in the pipeline's google_places and fetches its reviews live.
 * 'no_listing' covers no row, a null place ID and a place Google has removed (its row is deleted so ingest re-matches).
 */
export async function getGoogleForBuilding(db:PipelineDb,bbl:string):Promise<GoogleReviews|'no_listing'|null>{
  const {data,error}=await db.from('google_places').select('place_id').eq('bbl',bbl).maybeSingle();
  if(error){console.error(`Reading google_places for ${bbl}: ${error.message}`);return null;}
  if(!data?.place_id)return 'no_listing';
  const result=await getGoogleReviews(data.place_id);
  if(result!=='not_found')return result;
  const {error:deleteError}=await db.from('google_places').delete().eq('bbl',bbl);
  if(deleteError)console.error(`Deleting stale google_places row for ${bbl}: ${deleteError.message}`);
  return 'no_listing';
}

/**
 * Returns the place's rating and up to 5 reviews in Google's order (by relevance; never re-sort, ToS §3.2.3(g)).
 * 'not_found' means the place ID is gone: the caller deletes its google_places row so the next ingest re-matches.
 * null means any other failure; it's logged and never thrown, so the page still renders.
 */
export async function getGoogleReviews(placeId:string):Promise<GoogleReviews|'not_found'|null>{
  const key=process.env.GOOGLE_MAPS_API_KEY;
  if(!key||!/^[\w-]+$/.test(placeId)){console.error('Google Places: missing key or invalid place ID');return null;}
  try{
    const res=await fetch(`https://places.googleapis.com/v1/places/${placeId}`,{
      headers:{'X-Goog-Api-Key':key,'X-Goog-FieldMask':MASK},
      cache:'no-store', // Next's fetch cache would otherwise store Google content
      signal:AbortSignal.timeout(10_000),
    });
    if(res.status===404)return 'not_found';
    if(!res.ok){console.error(`Google Places details: HTTP ${res.status} ${(await res.text().catch(()=>'')).slice(0,200)}`);return null;}
    const d=detailsSchema.parse(await res.json());
    return {
      placeId:d.id,
      rating:d.rating??null,
      ratingCount:d.userRatingCount??0,
      url:d.googleMapsUri??null,
      reviews:(d.reviews??[]).map(r=>({
        rating:r.rating,
        text:r.text?.text??null,
        originalText:r.originalText?.text??null,
        translated:Boolean(r.originalText&&r.text&&r.originalText.languageCode!==r.text.languageCode),
        author:r.authorAttribution.displayName,
        authorUri:r.authorAttribution.uri??null,
        authorPhotoUri:r.authorAttribution.photoUri??null,
        relativeTime:r.relativePublishTimeDescription??null,
        url:r.googleMapsUri,
        flagUrl:r.flagContentUri??null,
      })),
    };
  }catch(e){console.error(`Google Places details: ${e instanceof Error?e.message:e}`);return null;}
}
