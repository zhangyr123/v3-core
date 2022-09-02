import { DebuggerOptions, ReactiveEffect } from './effect'
import { Ref, trackRefValue, triggerRefValue } from './ref'
import { isFunction, NOOP } from '@vue/shared'
import { ReactiveFlags, toRaw } from './reactive'
import { Dep } from './dep'

declare const ComputedRefSymbol: unique symbol

export interface ComputedRef<T = any> extends WritableComputedRef<T> {
  readonly value: T
  [ComputedRefSymbol]: true
}

export interface WritableComputedRef<T> extends Ref<T> {
  readonly effect: ReactiveEffect<T>
}

export type ComputedGetter<T> = (...args: any[]) => T
export type ComputedSetter<T> = (v: T) => void

export interface WritableComputedOptions<T> {
  get: ComputedGetter<T>
  set: ComputedSetter<T>
}

export class ComputedRefImpl<T> {
  public dep?: Dep = undefined

  private _value!: T
  // 暴露effect对象以便计算属性可以停止计算
  public readonly effect: ReactiveEffect<T>

  public readonly __v_isRef = true
  public readonly [ReactiveFlags.IS_READONLY]: boolean = false

  // 数据是否是脏的
  public _dirty = true
  public _cacheable: boolean

  constructor(
    getter: ComputedGetter<T>,
    private readonly _setter: ComputedSetter<T>,
    isReadonly: boolean,
    isSSR: boolean
  ) {
    // 创建副作用函数， 对getter函数做一层封装
    this.effect = new ReactiveEffect(getter, () => {
      if (!this._dirty) {
        this._dirty = true
        // 触发派发
        triggerRefValue(this)
      }
    })
    this.effect.computed = this
    this.effect.active = this._cacheable = !isSSR
    this[ReactiveFlags.IS_READONLY] = isReadonly
  }

  // 只有真正访问计算属性时才会真正运行computed getter函数计算
  get value() {
    // the computed ref may get wrapped by other proxies e.g. readonly() #3376
    const self = toRaw(this)
    // 依赖收集，收集运行访问该计算属性的activeEffect
    trackRefValue(self)
    if (self._dirty || !self._cacheable) {
      // 只有数据为脏数据的时候才会重新计算
      self._dirty = false
      self._value = self.effect.run()!
    }
    return self._value
  }

  set value(newValue: T) {
    // 计算属性的setter
    this._setter(newValue)
  }
}

// const a = computed(() => {
//   return b.value
// })
// 这个例子中，a收集的是b内部的run函数
export function computed<T>(
  getter: ComputedGetter<T>,
  debugOptions?: DebuggerOptions
): ComputedRef<T>
export function computed<T>(
  options: WritableComputedOptions<T>,
  debugOptions?: DebuggerOptions
): WritableComputedRef<T>
export function computed<T>(
  getterOrOptions: ComputedGetter<T> | WritableComputedOptions<T>,
  debugOptions?: DebuggerOptions,
  isSSR = false
) {
  // setter函数
  let getter: ComputedGetter<T>
  // getter函数
  let setter: ComputedSetter<T>

  // 标准化参数，根据参数类型，初始化函数内部定义的getter和setter函数
  const onlyGetter = isFunction(getterOrOptions)
  if (onlyGetter) {
    // 表面传入的是getter函数，不能修改计算属性的值
    getter = getterOrOptions
    setter = __DEV__
      ? () => {
          console.warn('Write operation failed: computed value is readonly')
        }
      : NOOP
  } else {
    getter = getterOrOptions.get
    setter = getterOrOptions.set
  }

  // 创建computedRefImpl对象
  const cRef = new ComputedRefImpl(getter, setter, onlyGetter || !setter, isSSR)

  if (__DEV__ && debugOptions && !isSSR) {
    cRef.effect.onTrack = debugOptions.onTrack
    cRef.effect.onTrigger = debugOptions.onTrigger
  }

  return cRef as any
}
