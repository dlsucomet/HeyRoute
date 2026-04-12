/**
* This module serves as the bridge between React Native and Mapbox Navigation SDK on Android.
*
* Handles:
* - Navigation initialization
* - Route refinement using Map Matching
* - Real-time navigation updates (location, distance, instructions)
* - Off-route detection and manual rerouting logic
*/

package com.heyroute

import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.mapbox.api.directions.v5.DirectionsCriteria
import com.mapbox.geojson.Point
import com.mapbox.geojson.LineString
import com.mapbox.navigation.base.options.NavigationOptions
import com.mapbox.navigation.core.MapboxNavigation
import com.mapbox.navigation.core.lifecycle.MapboxNavigationApp
import com.mapbox.navigation.core.trip.session.RouteProgressObserver
import com.mapbox.navigation.core.trip.session.LocationMatcherResult
import com.mapbox.navigation.core.trip.session.LocationObserver
import com.mapbox.navigation.core.trip.session.OffRouteObserver
import com.mapbox.navigation.core.trip.session.VoiceInstructionsObserver
import com.mapbox.navigation.core.mapmatching.MapMatchingOptions 
import com.mapbox.navigation.core.mapmatching.MapMatchingAPICallback
import com.mapbox.navigation.core.mapmatching.MapMatchingSuccessfulResult
import com.mapbox.navigation.core.mapmatching.MapMatchingFailure
import com.mapbox.navigation.base.ExperimentalPreviewMapboxNavigationAPI
import com.mapbox.common.location.Location

class NavigationModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    // Instances of Mapbox Navigation engine
    private var mapboxNavigation: MapboxNavigation? = null

    // Store the last known user location
    private var lastLocation: Location? = null

    // Define the OffRouteObserver to handle rerouting when the user goes off the planned route
    private val offRouteObserver = OffRouteObserver { isOffRoute ->
        if (isOffRoute) {
            android.util.Log.d("NavigationModule", "User is off-route. Triggering placeholder reroute logic.")
            handleManualReroute()
        }
    }

    /**
     * Observer for handling voice instructions during navigation.
     */
    private val voiceInstructionsObserver = VoiceInstructionsObserver { voiceInstructions ->
        val announcement = voiceInstructions.announcement()
        android.widget.Toast.makeText(reactApplicationContext, "Announcement: $announcement", android.widget.Toast.LENGTH_LONG).show()
        if (!announcement.isNullOrEmpty()) {
            val map = Arguments.createMap()
            map.putString("event", "voice_instruction")
            map.putString("announcement", announcement)

            Handler(Looper.getMainLooper()).post {
                if (reactApplicationContext.hasActiveCatalystInstance()) {
                    reactApplicationContext
                        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                        .emit("onVoiceInstruction", map)
                }
            }
        }
    }

    /**
    * Observer for handling location updates, capturing both raw GPS data and the map matched (road-snapped) location updates
    */
    private val locationObserver = object : LocationObserver {
        // Receive raw GPS location updates (unsnapped)
        override fun onNewRawLocation(rawLocation: Location) {
            lastLocation = rawLocation
        }

        // Receive enhanced location updates (snapped to road geometry)
        override fun onNewLocationMatcherResult(locationMatcherResult: LocationMatcherResult) {
            lastLocation = locationMatcherResult.enhancedLocation
            val enhancedLocation = locationMatcherResult.enhancedLocation
        }
    }
    
    // Name exposed to React Native when importing the module
    override fun getName(): String = "NavigationModule"

    /**
    * Stats navigation by:
    * 1. Parsing the provided coordinates
    * 2. Initialize Mapbox Navigation if not already set up
    * 3. Perfoming map matching
    * 4. Starting guidance session
    *
    * @param primaryCoordsJson: A JSON string representing an array of [lng, lat] coordinates for the primary route

    * @param alternativesJson: A JSON string representing an array of alternative routes
     */

    @OptIn(ExperimentalPreviewMapboxNavigationAPI::class)
    @ReactMethod
    fun startNavigation(primaryCoordsJson: String, alternativesJson: String) {
        // Grab the activity before entering the Handler
        val activity = getCurrentActivity()

        // Run navigation setup on the Main Thread to avoid thread exceptions
        Handler(Looper.getMainLooper()).post {
            val primaryPoints = parseCoords(primaryCoordsJson)

            if (primaryPoints.size > 100) {
                android.widget.Toast.makeText(reactApplicationContext, "ERROR: Failed to start navigation due to having more than 100 coordinates.", android.widget.Toast.LENGTH_LONG).show()
            } else {
                if (mapboxNavigation == null) {
                    if (!MapboxNavigationApp.isSetup()) {
                        // Since 'RerouteDisabled' is the default for map-matched routes,
                        val rerouteOptions = com.mapbox.navigation.base.options.RerouteOptions.Builder().build()

                        // Attach them to NavigationOptions
                        val navigationOptions = NavigationOptions.Builder(reactApplicationContext)
                            .enableSensors(false)
                            .rerouteOptions(rerouteOptions)
                            .build()
                        MapboxNavigationApp.setup(navigationOptions)
                    }
                    // Attach the lifecycle owner to wake up the engine
                    if (activity is androidx.lifecycle.LifecycleOwner) {
                        MapboxNavigationApp.attach(activity)
                    }
                    mapboxNavigation = MapboxNavigationApp.current()
                }

                val mapMatchOptions = MapMatchingOptions.Builder()
                    .coordinates(primaryPoints)
                    .profile(DirectionsCriteria.PROFILE_DRIVING)
                    .voiceInstructions(true)
                    .bannerInstructions(true)
                    .build()

                mapboxNavigation?.requestMapMatching(mapMatchOptions, object : MapMatchingAPICallback {
                    override fun success(result: MapMatchingSuccessfulResult) {
                        // Success callback often runs on background thread; move to Main
                        Handler(Looper.getMainLooper()).post {
                            val routes = result.navigationRoutes
                            if (routes.isNotEmpty()) {
                                // Get the primary route (the one that snapped to the road)
                                val primaryRoute = routes[0]
                                
                                // Get the "True" geometry
                                val highResGeometry = primaryRoute.directionsRoute.geometry()

                                // Emit this back to React Native so the MapView can draw it
                                val map = Arguments.createMap()
                                map.putString("event", "route_refined")
                                map.putString("geometry", highResGeometry)
                                reactApplicationContext
                                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                                    .emit("onRouteRefined", map)
                                    
                                startGuidance(result.navigationRoutes)
                            }
                        }
                    }

                    override fun failure(failure: MapMatchingFailure) {
                        Handler(Looper.getMainLooper()).post {
                            val reason = failure ?: "Unknown Error"
                            android.util.Log.e("NavigationModule", "MapMatching failed: $reason")
                        }
                    }

                    override fun onCancel() {}
                })
            }
        }
    }

    private fun startGuidance(routes: List<com.mapbox.navigation.base.route.NavigationRoute>) {
        val navigation = mapboxNavigation ?: return

        val routeProgressObserver = RouteProgressObserver { progress ->
            val map = Arguments.createMap()

            val snappedPoint = lastLocation ?: return@RouteProgressObserver
            val lat = snappedPoint.latitude
            val lng = snappedPoint.longitude
            val bearing = snappedPoint.bearing ?: 0.0 // Direction the car is facing

            val legProgress = progress.currentLegProgress
            val stepProgress = legProgress?.currentStepProgress
            val step = progress.currentLegProgress?.currentStepProgress?.step
            val maneuver = step?.maneuver()
            val instructions = maneuver?.instruction() ?: ""
            val direction = maneuver?.modifier() ?: ""

            val distanceToNextTurn = stepProgress?.distanceRemaining?.toInt() ?: 0
            val primaryBanner = progress.bannerInstructions?.primary()
            val secondaryBanner = progress.bannerInstructions?.secondary()
            val totalDistanceRemaining = progress.distanceRemaining.toInt()
            val totalDurationRemaining = (progress.durationRemaining / 60).toInt()

            map.putString("direction", direction)
            map.putString("street", primaryBanner?.text() ?: "")
            map.putString("stepDistance", "$distanceToNextTurn m")
            map.putString("distanceRemaining", "$totalDistanceRemaining m")
            map.putString("duration", "$totalDurationRemaining mins.")
            map.putDouble("latitude", lat)
            map.putDouble("longitude", lng)
            map.putDouble("bearing", bearing)

            // EMITTING TO JS MUST BE ON MAIN THREAD
            Handler(Looper.getMainLooper()).post {
                if (reactApplicationContext.hasActiveCatalystInstance()) {
                    reactApplicationContext
                        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                        .emit("onNavigationUpdate", map)
                }
            }
        }

        navigation.registerRouteProgressObserver(routeProgressObserver)
        navigation.registerVoiceInstructionsObserver(voiceInstructionsObserver)
        navigation.registerLocationObserver(locationObserver)
        navigation.registerOffRouteObserver(offRouteObserver)
        navigation.setNavigationRoutes(routes)
        navigation.startTripSession()
    }

    // Call ORS to generate a new route based on current location and destination
    private fun handleManualReroute() {
        // Use the lastLocation variable already maintained by locationObserver
        val currentLoc = lastLocation
        
        val map = Arguments.createMap()
        map.putBoolean("isOffRoute", true)
        
        // Send the current location back to JS so ORS knows the new 'origin'
        currentLoc?.let {
            map.putDouble("newOriginLat", it.latitude)
            map.putDouble("newOriginLng", it.longitude)
        }
        
        // Use the main thread to emit to JS
        Handler(Looper.getMainLooper()).post {
            if (reactApplicationContext.hasActiveCatalystInstance()) {
                reactApplicationContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit("onUserOffRoute", map)
            }
        }
    }

    private fun parseCoords(json: String): List<Point> {
        val points = mutableListOf<Point>()
        try {
            val array = org.json.JSONArray(json)
            for (i in 0 until array.length()) {
                val coord = array.getJSONArray(i)
                // Assuming [lng, lat] format
                points.add(Point.fromLngLat(coord.getDouble(0), coord.getDouble(1)))
            }
        } catch (e: Exception) {
            android.util.Log.e("NavigationModule", "Error parsing coordinates: ${e.message}")
        }
        return points
    }

    @ReactMethod
    fun stopNavigation() {
        Handler(Looper.getMainLooper()).post {
            mapboxNavigation?.unregisterVoiceInstructionsObserver(voiceInstructionsObserver)
            mapboxNavigation?.unregisterLocationObserver(locationObserver)
            mapboxNavigation?.unregisterOffRouteObserver(offRouteObserver)
            mapboxNavigation?.stopTripSession()
            mapboxNavigation = null
        }
    }
}
