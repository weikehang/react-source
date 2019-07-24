import {Element} from "./Element"
import $ from "jquery"
import React from "./react";
import types from "./types";

let diffQueue = [];//差异队列
let updateDepth = 0;//更新级别
//这个是所有文本、组件、节点类的基类
class Unit {
    constructor(element) {
        //保存当前的dom
        this._currentElement = element;
    }

    //这个方法给子类重写
    getMarkUp() {
        throw new Error("不能调用此方法!");
    }
}

//文本类
class TextUnit extends Unit {
    getMarkUp(reactId) {
        this._reactid = reactId;
        return `<span data-reactid="${reactId}">${this._currentElement}</span>`
    }

    update(nextElement) {
        //文本节点，对比值是不是相同的
        if (this._currentElement !== nextElement) {
            //节点不同，直接更新
            this._currentElement = nextElement;
            //替换页面中的节点
            $(`[data-reactid="${this._reactid}"]`).html(this._currentElement);
        }
    }
}

//原生节点类
class NativeUnit extends Unit {
    getMarkUp(reactid) {
        this._reactid = reactid;
        let {type, props} = this._currentElement;
        //拼接字符串
        let tagStart = `<${type} data-reactid="${this._reactid}"`;
        let childString = '';
        let tagEnd = `</${type}>`;
        this._renderedChildrenUnits = [];
        //遍历props
        for (let propName in props) {
            //如果是事件
            if (/^on[A-Z]/.test(propName)) {
                //绑定事件
                let eventName = propName.slice(2).toLowerCase();
                $(document).delegate(`[data-reactid="${this._reactid}"]`, `${eventName}.${this._reactid}`, props[propName]);
            } else if (propName === "style") {
                //如果是样式  遍历拼接赋值
                let styleObj = props[propName];
                let styles = Object.entries(styleObj).map(([attr, value]) => {
                    return `${attr.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)}:${value}`;
                }).join(";");
                tagStart += (` style="${styles}" `);
            } else if (propName === "className") {
                //如果是类名，需要进行转换class
                tagStart += (` class="${props[propName]}" `);
            } else if (propName === "children") {
                //如果是子节点 需要创建元素 重新生成
                let children = props[propName];
                //遍历子节点树
                children.forEach((child, index) => {
                    //获取每个节点树的unit
                    let childUnit = createUnit(child);
                    //给每个childUnit，数组中的每个节点添加索引标记
                    childUnit._mountIndex = index;
                    //把生成过的childUnit给缓存起来
                    this._renderedChildrenUnits.push(childUnit);
                    //获取每个unit生成的dom节点
                    let childMarkUp = childUnit.getMarkUp(`${this._reactid}.${index}`);
                    //拼接字符串
                    childString += childMarkUp;
                });
            } else {
                //如果是自定义属性
                tagStart += (` ${propName}=${props[propName]} `);
            }
        }
        return tagStart + ">" + childString + tagEnd;
    }

    //添加本类的update
    //现在的更新只是虚拟dom的更新了
    update(nextElement) {
        //获取渲染过的虚拟dom
        let oldProps = this._currentElement.props;
        //获取新的虚拟dom的props
        let newProps = nextElement.props;
        //如果第一层标签相同 检测属性 更新属性
        this.updateDomProperties(oldProps, newProps);
        this.updateDomChildren(nextElement.props.children);
    }

    //更新属性 将老的属性去掉，换成新的属性
    updateDomProperties(oldProps, newProps) {
        let propName;
        //遍历loader的属性集合 去掉属性 然后直接给操作dom的属性 或者事件
        for (propName in oldProps) {
            //在新的属性集合看有没有对应的key，没有则删除就的属性
            if (!newProps.hasOwnProperty(propName)) {
                $(`[data-reactid="${this._reactid}"]`).removeAttr(propName);
            }
            //把旧的事件也删除
            if (/^on[A-Z]/.test(propName)) {
                $(document).undelegate(`.${this._reactid}`);
            }
        }

        //遍历新的属性集合 直接给dom添加属性或者事件
        for (propName in newProps) {
            //如果有子节点
            if (propName === "children") {
                continue;
            } else if (/^on[A-Z]/.test(propName)) {
                //如果是事件 绑定事件
                let eventName = propName.slice(2).toLowerCase();//click
                $(document).delegate(`[data-reactid="${this._reactid}"]`, `${eventName}.${this._reactid}`, newProps[propName]);
            } else if (propName === "className") {
                //如果是className 赋值给class
                $(`[data-reactid="${this._reactid}"]`).attr('class', newProps[propName]);
            } else if (propName === "style") {
                //如果是style 遍历 拼接
                let styleObj = newProps[propName];
                Object.entries(styleObj).map(([attr, value]) => {
                    $(`[data-reactid="${this._reactid}"]`).css(attr, value);
                })
            } else {
                //其他自定义属性
                $(`[data-reactid="${this._reactid}"]`).prop(propName, newProps[propName]);
            }
        }

    }

    //然后就更新子节点 也是一样，先跟新属性 再更新其他的
    //更新子节点 也是要对比新的子节点和旧的子节点的差异
    updateDomChildren(newChildrenElements) {
        updateDepth++;
        //先要做比较
        this.diff(diffQueue, newChildrenElements);
        updateDepth--;
        if (updateDepth === 0) {
            //遍历所有的子节点树后开始 打补丁
            this.patch(diffQueue);
            diffQueue = [];
        }
    }

    //比较新的子树和旧的子树
    diff(diffQueue, newChildrenElements) {
        //首先将旧的子树生成一个unitMap
        let oldChildrenUnitMap = this.getOldChildrenMap(this._renderedChildrenUnits);

        //第二部生成一个新的儿子的unit数组
        let {newChildrenUnitMap, newChildrenUnits} = this.getNewChildren(oldChildrenUnitMap, newChildrenElements);
        //保存上一个已经确定的索引
        let lastIndex = 0;
        //遍历新的unit数组
        for (let i = 0; i < newChildrenUnits.length; i++) {
            //获取一个unit
            let newUnit = newChildrenUnits[i];
            //拿出每个newKey
            let newKey = (newUnit._currentElement.props && newUnit._currentElement.props.key) || i.toString();
            //获取对应老的childUnit
            let oldChildUnit = oldChildrenUnitMap[newKey];

            //如果新老节点一致，说明复用了老节点
            if (newUnit === oldChildUnit) {
                //lastIndex是我遍历新数组节点=》相同节点的索引，如果lastIndex是新节点的索引，_mountIndex是旧节点的索引
                //如果新节点的索引大于旧节点的索引，例如旧的是1 新的是2 则当前节点要往后移动
                if (oldChildUnit._mountIndex < lastIndex) {
                    diffQueue.push({
                        parentId: this._reactid,
                        parentNode: $(`[data-reactid="${this._reactid}"]`),
                        type: types.MOVE,
                        fromId: oldChildUnit._mountIndex,
                        fromIndex: oldChildUnit._mountIndex,
                        toIndex: i
                    });
                }

                lastIndex = Math.max(lastIndex, oldChildUnit._mountIndex);

            } else {
                //如果新老节点不一致，但是老节点存在，需要删除
                if (oldChildUnit) {
                    diffQueue.push({
                        parentId: this._reactid,
                        parentNode: $(`[data-reactid="${this._reactid}"]`),
                        type: types.REMOVE,
                        fromIndex:oldChildUnit._mountIndex
                    });
                }
                diffQueue.push({
                    parentId: this._reactid,
                    parentNode: $(`[data-reactid="${this._reactid}"]`),
                    type: types.INSERT,
                    toIndex: i,
                    markUp: newUnit.getMarkUp(`${this._reactid}.${i}`)
                });
            }
            newUnit._mountIndex = i;
        }

        //遍历旧的树节点 标记为删除
        for (let oldKey in oldChildrenUnitMap) {
            let oldChild = oldChildrenUnitMap[oldKey];
            //如果新的节点中找不到用旧的key找不到，说明该节点被删除了
            if (!newChildrenUnitMap.hasOwnProperty(oldKey)) {
                diffQueue.push({
                    parentId: this._reactid,
                    parentNode: $(`[data-reactid="${this._reactid}"]`),
                    type: types.REMOVE,
                    fromIndex: oldChild._mountIndex
                });
                //如果删除了某一个节点，则把它对应的unit也删除
                this._renderedChildrenUnits = this._renderedChildrenUnits.filter(item => item != oldChild);
                //还要把这个节点地应的事件委托也删除掉
                $(document).undelegate(`.${oldChild._reactid}`);
            }
        }
    }

    getOldChildrenMap(childrenUnits = []) {
        let Map = {};
        for (let i = 0; i < childrenUnits.length; i++) {
            //获取每个子节点的unit
            let unit = childrenUnits[i];
            //获取每个unit的key 没有key则只用索引
            let key = (unit._currentElement.props && unit._currentElement.props.key) || i.toString();
            Map[key] = unit
        }
        return Map;
    }

    getNewChildren(oldChildrenUnitMap, newChildrenElements) {
        let newChildrenUnits = [];
        let newChildrenUnitMap = {};
        //遍历新的子节点树
        newChildrenElements.forEach((newElement, index) => {
            //获取每个子节点树的key
            let newKey = (newElement.props && newElement.props.key) || index.toString();
            //将新的key在旧的unitMap中找看看有没有对应的树 找到老的unit
            let oldUnit = oldChildrenUnitMap[newKey];
            //获取老的元素 比如获取到key为ACB的unit
            let oldElement = oldUnit && oldUnit._currentElement;

            //看看是不是需要深比较
            if (shouldDeepCompare(oldElement, newElement)) {
                //然后用旧点unit更新 如果是在旧的树中找到key 则在旧的基础上修改
                oldUnit.update(newElement);
                newChildrenUnits.push(oldUnit);
                newChildrenUnitMap[newKey] = oldUnit;
            } else {
                //如果是新的key 例如 EF
                //则创建新的unit
                let nextUnit = createUnit(newElement);
                newChildrenUnits.push(nextUnit);
                newChildrenUnitMap[newKey] = nextUnit;
                //缓存新渲染过的子节点树
                this._renderedChildrenUnits[index] = nextUnit;
            }

        });

        return {newChildrenUnits, newChildrenUnitMap}
    }

    patch(diffQueue) {
        //这里存放所有将要删除的节点
        let deleteChildren = [];
        //暂存复用的节点
        let deleteMap = {};
        //遍历需要更新的节点标记
        for (let i = 0; i < diffQueue.length; i++) {
            //找到每个一节点
            let difference = diffQueue[i];
            //判断当前节点的type是remove还是move
            if (difference.type === types.MOVE || difference.type === types.REMOVE) {
                //说明这个节点需要移动
                let fromIndex = difference.fromIndex;
                //获取到真实的dom
                let oldChild = $(difference.parentNode.children().get(fromIndex));
                //如果还没有存在复用的节点，则添加
                if (!deleteMap[difference.parentId]) {
                    deleteMap[difference.parentId] = {};
                }
                //暂存复用的节点
                deleteMap[difference.parentId][fromIndex] = oldChild;
                deleteChildren.push(oldChild);
            }
        }
        $.each(deleteChildren, (idx, item) => $(item).remove());

        //判断该插入的节点
        for (let i = 0; i < diffQueue.length; i++) {
            let difference = diffQueue[i];
            switch (difference.type) {
                case types.INSERT:
                    this.insertChildAt(difference.parentNode, difference.toIndex, $(difference.markUp));
                    break;
                case types.MOVE:
                    this.insertChildAt(difference.parentNode, difference.toIndex, deleteMap[difference.parentId][difference.fromIndex]);
                    break;
                default:
                    break
            }
        }
    }

    insertChildAt(parentNode, toIndex, newNode) {
        let oldChild = parentNode.children().get(toIndex);
        oldChild ? newNode.insertBefore(oldChild) : newNode.appendTo(parentNode)
    }
}


//处理自定义组件
class CompositeUnit extends Unit {
    //负责自定义组件的更新操作 在getMarkUp的时候已经获取到组件的实例，保存起来，所有更新操作都在这里做
    //能够调用update是因为使用的setState,默认会调用当前类的update
    update(nextElement, partialState) {
        //如果传进来新的元素，则取新的元素，否则使用旧的
        this._currentElement = nextElement || this._currentElement;

        //获取新的state和状态,更新状态 不管组件有没有更新，状态一定要更新
        //直接更新组件的state属性
        let nextState = Object.assign(this._componentInstance.state, partialState);
        let nextProps = this._currentElement.props;
        //如果有shouldComponentUpdate执行，判断是否返回值是true还是false,是不是需要更新
        if (this._componentInstance.shouldComponentUpdate && !this._componentInstance.shouldComponentUpdate(nextProps, nextState)) {
            return;
        }

        //获取虚拟dom，看看是不是需要深比较
        //获取上一次实例的组件对象
        let preRenderedUnitInstance = this._renderedUnitInstance;

        //从unit中获取获取渲染过的虚拟dom
        let preRenderedElement = preRenderedUnitInstance._currentElement;

        //获取新的虚拟dom
        //注意 ：重新调用render的时候会返回下面：原生节点类=》调用update的时候会触发原生节点类的update
        /* let p = React.createElement('p',{},this.state.number);
         let button = React.createElement('button',{onClick:this.handleClick},'+');
         return React.createElement('div',{id:"counter",style:{color:this.state.number%2 === 0 ? "red" : "green"}},p,button);*/
        // return this.state.number;
        //此时重新render就会触发createElement,然后通过createUnit创建，会得到原生节点类的实例；
        // nextRenderElement就是NativeUnit类的实例
        let nextRenderElement = this._componentInstance.render();

        //进行dom diff比较
        //判断是否需要深度比较
        if (shouldDeepCompare(preRenderedElement, nextRenderElement)) {
            //如果需要更新，则调用子节点update方法进行更新，转入新的el节点,是文本=》调用textUnit 等
            //preRenderUnitInstance => NativeUnit类的实例，可以调用update方法
            //此时的update是原生节点类的update
            preRenderedUnitInstance.update(nextRenderElement);
            //调用更新完成钩子
            this._componentInstance.componentDidUpdate && this._componentInstance.componentDidUpdate();
        } else {
            //不需要深比较，直接替换元素为新的
            this._renderedUnitInstance = createUnit(nextRenderElement);
            let nextMarkUp = this._renderedUnitInstance.getMarkUp(this._reactid);

            //替换整个节点
            $(`[data-reactid="${this._reactid}"]`).replaceWith(nextMarkUp);
        }
    }

    getMarkUp(reactId) {
        this._reactid = reactId;
        //解构拿出参数 Component是自定义组件
        let {type: Component, props} = this._currentElement;
        //componentInstance是自定义组件的实例
        let componentInstance = this._componentInstance = new Component(props);
        //创建component实例_currentUnit中  this 是CompositeUint
        componentInstance._currentUnit = this;
        //将当前实例存到自定义属性
        //组件将要渲染 存在componentWillMount运行
        componentInstance.componentWillMount && componentInstance.componentWillMount();
        //执行render,获取虚拟dom的实例
        let renderElement = componentInstance.render();
        //此时获取的结果有可能是 string number 组件 原生节点 需调用 createUnit
        //this._renderedUnitInstance 这个保存起来，更新的时候用到
        let renderUnitInstance = this._renderedUnitInstance = createUnit(renderElement);
        //获取html标记
        let renderMarkUp = renderUnitInstance.getMarkUp(this._reactid);
        //页面注册挂载完成的监听
        $(document).on("mounted", () => {
            componentInstance.componentDidMount && componentInstance.componentDidMount()
        });
        return renderMarkUp;
    }
}

//是否需要深度比较 类型一样才可以进行深比较
function shouldDeepCompare(oldElement, newElement) {
    //判断元素是否为null
    if (oldElement != null && newElement != null) {
        //先比较类型
        let oldType = typeof oldElement;
        let newType = typeof newElement;
        //如果新老节点是文本可以进行比较
        if ((oldType === "string" || oldType === "number") && (newType === "string" || newType === "number")) {
            return true;
        }

        //如果是react元素，判断type是不是相同的
        if (oldElement instanceof Element && newElement instanceof Element) {
            return oldElement.type == newElement.type;
        }

    }
    //默认不需要深比较
    return false;
}

//调用对应处理文本、组件、节点的类
function createUnit(element) {
    //处理文本的类型
    if (typeof element === 'string' || typeof element === 'number') {
        return new TextUnit(element);
    }
    //处理react原生节点
    if (element instanceof Element && typeof element.type === 'string') {
        return new NativeUnit(element);
    }
    //处理自定义组件
    if (element instanceof Element && typeof element.type === 'function') {
        return new CompositeUnit(element);
    }
}

export {
    createUnit
};

