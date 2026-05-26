'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import type { NearbyProperty } from '../actions/dfd';
import { getNearbyProperties, saveDfdLead, uploadPropertyPhoto } from '../actions/dfd';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface GpsPoint {
  lat: number;
  lng: number;
  ts: number;
}

interface SavedDfdLead {
  leadEventId: string;
  propertyId: string;
  address: string;
  savedAt: Date;
}

interface ModalState {
  property: NearbyProperty;
  saving: boolean;
  saved: boolean;
  error: string | null;
}

export function DfdClient() {
  const [currentPos, setCurrentPos] = useState<GeolocationPosition | null>(null);
  const [posError, setPosError] = useState<string | null>(null);
  const [routePoints, setRoutePoints] = useState<GpsPoint[]>([]);
  const [isTracking, setIsTracking] = useState(false);
  const [nearbyProperties, setNearbyProperties] = useState<NearbyProperty[]>([]);
  const [loadingNearby, setLoadingNearby] = useState(false);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [savedLeads, setSavedLeads] = useState<SavedDfdLead[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoMsg, setPhotoMsg] = useState<string | null>(null);
  const [selectedPropertyForPhoto, setSelectedPropertyForPhoto] = useState<string | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const [isPending, startTransition] = useTransition();

  // Start GPS watch
  function startTracking() {
    if (!navigator.geolocation) {
      setPosError('Geolocation is not supported by this browser.');
      return;
    }
    setIsTracking(true);
    setRoutePoints([]);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setCurrentPos(pos);
        setRoutePoints((prev) => [
          ...prev,
          { lat: pos.coords.latitude, lng: pos.coords.longitude, ts: Date.now() },
        ]);
      },
      (err) => {
        setPosError(err.message);
        setIsTracking(false);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
  }

  function stopTracking() {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTracking(false);
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  // Load nearby properties when position changes (throttled: only when moved >50m or initial)
  const lastFetchPosRef = useRef<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (!currentPos) return;
    const { latitude: lat, longitude: lng } = currentPos.coords;

    const last = lastFetchPosRef.current;
    if (last) {
      const dx = Math.abs(lat - last.lat);
      const dy = Math.abs(lng - last.lng);
      // ~50m threshold
      if (dx < 0.0004 && dy < 0.0004) return;
    }

    lastFetchPosRef.current = { lat, lng };
    setLoadingNearby(true);
    getNearbyProperties(lat, lng, 1)
      .then((props) => setNearbyProperties(props))
      .catch(() => {
        // silently fail
      })
      .finally(() => setLoadingNearby(false));
  }, [currentPos]);

  // Open property modal
  function openModal(property: NearbyProperty) {
    setModal({ property, saving: false, saved: false, error: null });
  }

  function closeModal() {
    setModal(null);
  }

  // Save to inbox
  function handleSaveToInbox() {
    if (!modal || !currentPos) return;
    const { latitude: lat, longitude: lng } = currentPos.coords;
    setModal((prev) => (prev ? { ...prev, saving: true, error: null } : null));

    startTransition(async () => {
      const result = await saveDfdLead(modal.property.id, lat, lng);
      if ('error' in result) {
        setModal((prev) => (prev ? { ...prev, saving: false, error: result.error } : null));
      } else {
        setModal((prev) => (prev ? { ...prev, saving: false, saved: true } : null));
        setSavedLeads((prev) => [
          {
            leadEventId: result.leadEventId,
            propertyId: modal.property.id,
            address: `${modal.property.addressLine1}, ${modal.property.city}`,
            savedAt: new Date(),
          },
          ...prev,
        ]);
      }
    });
  }

  // Photo upload
  async function handlePhotoChange(
    propertyId: string,
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingPhoto(true);
    setPhotoMsg(null);
    setSelectedPropertyForPhoto(propertyId);

    const formData = new FormData();
    formData.append('photo', file);

    try {
      const result = await uploadPropertyPhoto(propertyId, formData);
      if ('error' in result) {
        setPhotoMsg(`Upload failed: ${result.error}`);
      } else {
        setPhotoMsg(result.url ? `Photo uploaded: ${result.url}` : 'Photo upload skipped (no Supabase config)');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setPhotoMsg(msg);
    } finally {
      setUploadingPhoto(false);
      setSelectedPropertyForPhoto(null);
    }
  }

  const posLat = currentPos?.coords.latitude;
  const posLng = currentPos?.coords.longitude;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Driving for Dollars</h1>
        <p className="text-sm text-gray-500 mt-1">
          Track your route and discover nearby properties.
        </p>
      </div>

      {/* Map placeholder */}
      <Card>
        <CardHeader>
          <CardTitle>Map</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md bg-gray-100 border border-dashed border-gray-300 p-6 text-sm text-gray-500 space-y-2">
            <p className="font-medium text-gray-700">
              Map powered by MapLibre + OpenStreetMap
            </p>
            <p>
              Requires <code className="bg-gray-200 px-1 rounded">NEXT_PUBLIC_MAPTILER_KEY</code> or
              similar tile provider.
            </p>
            <p>
              Install:{' '}
              <code className="bg-gray-200 px-1 rounded">pnpm add maplibre-gl</code> and wire up in
              Module 4 final.
            </p>
            {posLat != null && posLng != null && (
              <p className="text-green-700 font-medium">
                Current position: {posLat.toFixed(5)}, {posLng.toFixed(5)}
              </p>
            )}
            {routePoints.length > 0 && (
              <p className="text-blue-700">
                Route: {routePoints.length} GPS point{routePoints.length !== 1 ? 's' : ''} recorded
              </p>
            )}
          </div>

          {/* GPS route controls */}
          <div className="flex gap-3 mt-4">
            {!isTracking ? (
              <Button onClick={startTracking} disabled={isPending}>
                Start route
              </Button>
            ) : (
              <Button variant="outline" onClick={stopTracking} disabled={isPending}>
                Stop route
              </Button>
            )}
            {routePoints.length > 0 && (
              <span className="self-center text-sm text-gray-500">
                {routePoints.length} point{routePoints.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {posError && (
            <p className="mt-2 text-sm text-red-600">{posError}</p>
          )}
        </CardContent>
      </Card>

      {/* Nearby properties */}
      <Card>
        <CardHeader>
          <CardTitle>
            Nearby Properties
            {loadingNearby && (
              <span className="ml-2 text-sm font-normal text-gray-400">Loading...</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!currentPos && !posError && (
            <p className="text-sm text-gray-500">Start route to see nearby properties.</p>
          )}
          {nearbyProperties.length === 0 && currentPos && !loadingNearby && (
            <p className="text-sm text-gray-500">No properties found within 1 mile.</p>
          )}
          <div className="space-y-2">
            {nearbyProperties.map((prop) => (
              <div
                key={prop.id}
                className="flex items-center justify-between gap-3 p-3 rounded-md border border-gray-200 hover:bg-gray-50 cursor-pointer"
                onClick={() => openModal(prop)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{prop.addressLine1}</p>
                  <p className="text-xs text-gray-500">
                    {prop.city}, {prop.state} {prop.zip}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`inline-block w-3 h-3 rounded-full ${
                      prop.buyBoxMatch ? 'bg-green-500' : 'bg-gray-400'
                    }`}
                    title={prop.buyBoxMatch ? 'Buy-box match' : 'No match'}
                  />
                  <Badge variant={prop.buyBoxMatch ? 'contactable' : 'default'}>
                    {prop.buyBoxMatch ? 'Match' : 'No match'}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Saved DFD leads */}
      {savedLeads.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Saved DFD Leads</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {savedLeads.map((sl) => (
                <div
                  key={sl.leadEventId}
                  className="flex items-center justify-between gap-3 p-3 rounded-md border border-gray-200"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{sl.address}</p>
                    <p className="text-xs text-gray-400">
                      Saved {sl.savedAt.toLocaleTimeString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Photo upload */}
                    <label
                      className="inline-flex items-center justify-center h-8 px-3 text-xs rounded-md border border-gray-300 bg-white text-gray-900 hover:bg-gray-50 cursor-pointer"
                      htmlFor={`photo-${sl.propertyId}`}
                    >
                      {uploadingPhoto && selectedPropertyForPhoto === sl.propertyId
                        ? 'Uploading...'
                        : 'Photo'}
                    </label>
                    <input
                      id={`photo-${sl.propertyId}`}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="sr-only"
                      onChange={(e) => handlePhotoChange(sl.propertyId, e)}
                      disabled={uploadingPhoto}
                    />
                    <a
                      href={`/inbox/${sl.leadEventId}`}
                      className="text-xs text-gray-500 hover:text-gray-900"
                    >
                      View
                    </a>
                  </div>
                </div>
              ))}
              {photoMsg && (
                <p className="text-xs text-gray-600">{photoMsg}</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Property modal */}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {modal.property.addressLine1}
              </h2>
              <p className="text-sm text-gray-500">
                {modal.property.city}, {modal.property.state} {modal.property.zip}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              {modal.property.beds != null && (
                <div>
                  <p className="text-xs text-gray-400">Beds</p>
                  <p>{modal.property.beds}</p>
                </div>
              )}
              {modal.property.baths != null && (
                <div>
                  <p className="text-xs text-gray-400">Baths</p>
                  <p>{modal.property.baths}</p>
                </div>
              )}
              {modal.property.sqft != null && (
                <div>
                  <p className="text-xs text-gray-400">Sqft</p>
                  <p>{modal.property.sqft.toLocaleString()}</p>
                </div>
              )}
              {modal.property.currentListPrice != null && (
                <div>
                  <p className="text-xs text-gray-400">List price</p>
                  <p>${modal.property.currentListPrice.toLocaleString()}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-gray-400">Status</p>
                <p>{modal.property.currentStatus}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Buy-box</p>
                <p>{modal.property.buyBoxMatch ? 'Match' : 'No match'}</p>
              </div>
            </div>

            {modal.error && (
              <p className="text-sm text-red-600">{modal.error}</p>
            )}

            {modal.saved ? (
              <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3">
                <p className="text-sm text-green-700 font-medium">
                  Saved to inbox — BatchData lookup triggered.
                </p>
                <p className="text-xs text-green-600 mt-1">
                  Lead status: watch_only (DFD default — buy-box match confirmed separately).
                </p>
              </div>
            ) : (
              <div className="flex gap-3">
                <Button
                  disabled={modal.saving || isPending || !currentPos}
                  onClick={handleSaveToInbox}
                  className="flex-1"
                >
                  {modal.saving ? 'Saving...' : 'Save to inbox'}
                </Button>
                <Button variant="outline" onClick={closeModal} disabled={modal.saving}>
                  Cancel
                </Button>
              </div>
            )}

            {!currentPos && (
              <p className="text-xs text-yellow-600">
                GPS location required to save. Start route first.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
